"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, createSession, requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      awayGoals: z.coerce.number().int().min(0).max(99)
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

  await prisma.prediction.upsert({
    where: {
      userId_matchId: {
        userId: user.id,
        matchId: match.id
      }
    },
    update: {
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals
    },
    create: {
      userId: user.id,
      matchId: match.id,
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals
    }
  });

  revalidatePath("/");
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
      awayGoals: z.string()
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

  await prisma.match.update({
    where: { id: parsed.data.matchId },
    data: {
      homeGoals: bothEmpty ? null : Number(parsed.data.homeGoals),
      awayGoals: bothEmpty ? null : Number(parsed.data.awayGoals)
    }
  });

  revalidatePath("/");
  revalidatePath("/admin");
}
