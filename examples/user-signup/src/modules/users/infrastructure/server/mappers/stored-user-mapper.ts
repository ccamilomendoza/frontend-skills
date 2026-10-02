import type { User } from "../../../domain/entities/user";
import type { MakeUserArgs } from "../../../domain/services/user-creation";
import type { StoredUserDto } from "../schemas/stored-user-schema";

export const storedUserToMakeUserArgs = (
  { user_id, full_name, email_address }: StoredUserDto,
): MakeUserArgs => ({
  id: user_id,
  name: full_name,
  email: email_address,
});

export const userToStoredUser = ({ id, name, email }: User): StoredUserDto => ({
  user_id: id,
  full_name: name,
  email_address: email,
});
