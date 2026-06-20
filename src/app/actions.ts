"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, createSession, requireAdmin, requireUser } from "@/lib/auth";
import { ExternalSyncError, syncResultsFromApiFootball } from "@/lib/external-sync";
import { prisma } from "@/lib/prisma";
import { resolveKnockoutWinner } from "@/lib/tournament";
import {
  resetTournamentBracket,
  syncTournamentBracket
} from "@/lib/tournament-service";

const credentialsSchema = z.object({
  email: z.string().email("Ingresa un email valido").transform((value) => value.toLowerCase()),
  password: z.string().min(6, "La password debe tener al menos 6 caracteres")
});

export async function registerAction(_: unknown, formData: FormData) {
  try {
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Ingresa tu nombre"),
        email: credentialsSchema.shape.email,
        password: credentialsSchema.shape.password
      })
      .safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Datos invalidos" };
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email }
    });

    if (existing) {
      return { error: "Ya existe un usuario con ese email" };
    }

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        role: "USER"
      }
    });

    await createSession(user);
  } catch (error) {
    console.error("registerAction failed", error);
    return { error: "No se pudo crear el usuario. Revisa la configuracion de la base." };
  }

  redirect("/");
}

export async function loginAction(_: unknown, formData: FormData) {
  try {
    const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Datos invalidos" };
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email }
    });

    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return { error: "Email o password incorrectos" };
    }

    await createSession(user);
  } catch (error) {
    console.error("loginAction failed", error);
    return { error: "No se pudo iniciar sesion. Revisa la configuracion de la base." };
  }

  redirect("/");
}


export async function requestPasswordResetAction(_: unknown, formData: FormData) {
  try {
    const parsed = z
      .object({
        email: credentialsSchema.shape.email
      })
      .safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Ingresa un email valido" };
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { name: true, email: true }
    });

    if (!user) {
      return { error: "No existe un usuario con ese email" };
    }

    return { email: user.email, name: user.name };
  } catch (error) {
    console.error("requestPasswordResetAction failed", error);
    return { error: "No se pudo validar el usuario. Revisa la configuracion de la base." };
  }
}

export async function resetPasswordAction(_: unknown, formData: FormData) {
  try {
    const parsed = z
      .object({
        email: credentialsSchema.shape.email,
        password: credentialsSchema.shape.password,
        confirmPassword: z.string().min(1, "Confirma la nueva password")
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Las passwords no coinciden",
        path: ["confirmPassword"]
      })
      .safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Datos invalidos" };
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true }
    });

    if (!user) {
      return { error: "No existe un usuario con ese email" };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, 12)
      }
    });
  } catch (error) {
    console.error("resetPasswordAction failed", error);
    return { error: "No se pudo cambiar la password. Revisa la configuracion de la base." };
  }

  redirect("/login?reset=success");
}
export async function logoutAction() {
  clearSession();
  redirect("/login");
}

export async function savePredictionAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z
    .object({
      matchId: z.string().min(1),
      homeGoals: z.coerce.number().int().min(0).max(99),
      awayGoals: z.coerce.number().int().min(0).max(99),
      advancingTeam: z.string().trim().optional()
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/?error=prediction");
  }

  const match = await prisma.match.findUnique({
    where: { id: parsed.data.matchId }
  });

  if (!match || match.startsAt <= new Date()) {
    redirect("/?error=locked");
  }

  const isKnockout = match.round !== "GROUP";
  const advancingTeam =
    parsed.data.homeGoals > parsed.data.awayGoals
      ? match.homeTeam
      : parsed.data.awayGoals > parsed.data.homeGoals
        ? match.awayTeam
        : parsed.data.advancingTeam;
  if (
    isKnockout &&
    (!advancingTeam || ![match.homeTeam, match.awayTeam].includes(advancingTeam))
  ) {
    redirect("/?error=advancing-team");
  }

  await prisma.prediction.upsert({
    where: {
      userId_matchId: {
        userId: user.id,
        matchId: match.id
      }
    },
    update: {
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals,
      advancingTeam: isKnockout ? advancingTeam : null
    },
    create: {
      userId: user.id,
      matchId: match.id,
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals,
      advancingTeam: isKnockout ? advancingTeam : null
    }
  });

  revalidatePath("/");
  revalidatePath("/torneo");
}

export async function createMatchAction(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      homeTeam: z.string().trim().min(1),
      awayTeam: z.string().trim().min(1),
      phase: z.string().trim().min(1),
      startsAt: z.string().min(1)
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/admin?error=match");
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    redirect("/admin?error=date");
  }

  await prisma.match.create({
    data: {
      homeTeam: parsed.data.homeTeam,
      awayTeam: parsed.data.awayTeam,
      phase: parsed.data.phase,
      startsAt
    }
  });

  revalidatePath("/");
  revalidatePath("/admin");
}

export async function saveResultAction(formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = z
    .object({
      matchId: z.string().min(1),
      homeGoals: z.string(),
      awayGoals: z.string(),
      homePenalties: z.string().optional().default(""),
      awayPenalties: z.string().optional().default(""),
      homeYellowCards: z.coerce.number().int().min(0).default(0),
      awayYellowCards: z.coerce.number().int().min(0).default(0),
      homeSecondYellowReds: z.coerce.number().int().min(0).default(0),
      awaySecondYellowReds: z.coerce.number().int().min(0).default(0),
      homeDirectReds: z.coerce.number().int().min(0).default(0),
      awayDirectReds: z.coerce.number().int().min(0).default(0),
      homeYellowDirectReds: z.coerce.number().int().min(0).default(0),
      awayYellowDirectReds: z.coerce.number().int().min(0).default(0)
    })
    .safeParse(raw);

  if (!parsed.success) {
    redirect("/admin?error=result");
  }

  const bothEmpty = parsed.data.homeGoals === "" && parsed.data.awayGoals === "";
  const bothPresent = parsed.data.homeGoals !== "" && parsed.data.awayGoals !== "";

  if (!bothEmpty && !bothPresent) {
    redirect("/admin?error=incomplete");
  }

  const match = await prisma.match.findUnique({ where: { id: parsed.data.matchId } });
  if (!match) redirect("/admin?error=result");

  const homeGoals = bothEmpty ? null : Number(parsed.data.homeGoals);
  const awayGoals = bothEmpty ? null : Number(parsed.data.awayGoals);
  const homePenalties =
    bothEmpty || parsed.data.homePenalties === "" ? null : Number(parsed.data.homePenalties);
  const awayPenalties =
    bothEmpty || parsed.data.awayPenalties === "" ? null : Number(parsed.data.awayPenalties);
  const winnerTeam =
    match.round === "GROUP"
      ? null
      : resolveKnockoutWinner({
          ...match,
          homeGoals,
          awayGoals,
          homePenalties,
          awayPenalties
        });
  if (
    match.round !== "GROUP" &&
    homeGoals !== null &&
    awayGoals !== null &&
    homeGoals === awayGoals &&
    !winnerTeam
  ) {
    redirect("/admin?error=penalties");
  }

  await prisma.match.update({
    where: { id: parsed.data.matchId },
    data: {
      homeGoals,
      awayGoals,
      homePenalties,
      awayPenalties,
      winnerTeam,
      homeYellowCards: parsed.data.homeYellowCards,
      awayYellowCards: parsed.data.awayYellowCards,
      homeSecondYellowReds: parsed.data.homeSecondYellowReds,
      awaySecondYellowReds: parsed.data.awaySecondYellowReds,
      homeDirectReds: parsed.data.homeDirectReds,
      awayDirectReds: parsed.data.awayDirectReds,
      homeYellowDirectReds: parsed.data.homeYellowDirectReds,
      awayYellowDirectReds: parsed.data.awayYellowDirectReds
    }
  });

  await syncTournamentBracket();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/torneo");
}

export async function saveTeamRankingAction(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      team: z.string().trim().min(1),
      currentRank: z.string(),
      previousRank: z.string()
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin?error=ranking");

  await prisma.teamRanking.upsert({
    where: { team: parsed.data.team },
    update: {
      currentRank: parsed.data.currentRank ? Number(parsed.data.currentRank) : null,
      previousRank: parsed.data.previousRank ? Number(parsed.data.previousRank) : null
    },
    create: {
      team: parsed.data.team,
      currentRank: parsed.data.currentRank ? Number(parsed.data.currentRank) : null,
      previousRank: parsed.data.previousRank ? Number(parsed.data.previousRank) : null
    }
  });
  await syncTournamentBracket();
  revalidatePath("/admin");
  revalidatePath("/torneo");
}

export async function saveStandingOverrideAction(formData: FormData) {
  await requireAdmin();
  const parsed = z
    .object({
      group: z.string().trim().min(1),
      team: z.string().trim().min(1),
      position: z.coerce.number().int().min(1).max(12),
      note: z.string().trim().optional()
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin?error=override");

  const group = parsed.data.group.toUpperCase();
  await prisma.$transaction(async (tx) => {
    await tx.standingOverride.deleteMany({
      where: {
        group,
        position: parsed.data.position,
        team: { not: parsed.data.team }
      }
    });
    await tx.standingOverride.upsert({
      where: { group_team: { group, team: parsed.data.team } },
      update: { position: parsed.data.position, note: parsed.data.note || null },
      create: { ...parsed.data, group }
    });
  });
  await syncTournamentBracket();
  revalidatePath("/admin");
  revalidatePath("/torneo");
}

export async function resetBracketAction(formData: FormData) {
  await requireAdmin();
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "REINICIAR") redirect("/admin?error=reset-confirmation");
  try {
    await resetTournamentBracket(true);
  } catch {
    redirect("/admin?error=reset");
  }
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/torneo");
}

export async function syncTournamentAction() {
  await requireAdmin();
  await syncTournamentBracket();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/torneo");
}

export async function syncExternalResultsAction() {
  await requireAdmin();
  let result;

  try {
    result = await syncResultsFromApiFootball();
  } catch (error) {
    if (error instanceof ExternalSyncError) {
      redirect(`/admin?error=${error.code}`);
    }
    console.error("syncExternalResultsAction failed", error);
    redirect("/admin?error=external-api");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/ranking");
  revalidatePath("/torneo");
  revalidatePath("/mis-pronosticos");
  redirect(
    `/admin?sync=success&matched=${result.matched}&results=${result.resultsUpdated}` +
      `&cards=${result.disciplineUpdated}&pending=${result.pendingDiscipline}` +
      `&requests=${result.requests}&provider=${result.provider}`
  );
}
