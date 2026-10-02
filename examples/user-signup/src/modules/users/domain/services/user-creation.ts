import { err, ok, type Result } from "../../../shared/domain/results/result";
import { minimumUserNameLength, userEmailPattern } from "../constants/user-details-rules";
import type { User, UserDetails } from "../entities/user";

export interface MakeUserArgs extends UserDetails {
  readonly id: string;
}

export type UserDetailsError =
  | { readonly type: "InvalidName" }
  | { readonly type: "InvalidEmail" };

export type UserDomainError =
  | UserDetailsError
  | { readonly type: "InvalidUserId" };

export const makeUserDetails = (
  { name, email }: UserDetails,
): Result<UserDetails, UserDetailsError> => {
  if (name.trim().length < minimumUserNameLength) {
    return err({ type: "InvalidName" });
  }
  if (!userEmailPattern.test(email.trim())) {
    return err({ type: "InvalidEmail" });
  }

  return ok({
    name: name.trim(),
    email: email.trim().toLowerCase(),
  });
};

export const makeUser = (
  { id, name, email }: MakeUserArgs,
): Result<User, UserDomainError> => {
  if (id.trim().length === 0) return err({ type: "InvalidUserId" });

  const details = makeUserDetails({ name, email });
  if (!details.ok) return details;

  return ok({ id, ...details.value });
};
