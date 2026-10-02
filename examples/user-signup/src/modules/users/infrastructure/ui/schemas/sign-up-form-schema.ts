import { z } from "zod";
import { minimumUserNameLength, userEmailPattern } from "../../../domain/constants/user-details-rules";
import type { UserDetails } from "../../../domain/entities/user";

export const signUpFormSchema: z.ZodType<UserDetails> = z.object({
  name: z.string().trim().min(minimumUserNameLength, "Enter your name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(userEmailPattern, "Enter a valid email address."),
});
