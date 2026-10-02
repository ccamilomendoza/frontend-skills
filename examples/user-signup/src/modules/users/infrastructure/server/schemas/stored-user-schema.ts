import { z } from "zod";

export const storedUserSchema = z.object({
  user_id: z.string(),
  full_name: z.string(),
  email_address: z.string(),
});

export const storedUsersSchema = z.array(storedUserSchema);

export type StoredUserDto = z.infer<typeof storedUserSchema>;
