import type { User, UserDetails } from "../../domain/entities/user";
import type { CreateUserPort, CreateUserPortError } from "../../domain/ports/create-user-port";
import { makeUserDetails, type UserDetailsError } from "../../domain/services/user-creation";
import type { Result } from "../../../shared/domain/results/result";

export interface SignUpUserDependencies {
  readonly createUser: CreateUserPort;
}

export type SignUpUserError = UserDetailsError | CreateUserPortError;

export type SignUpUserUseCase = (
  details: UserDetails,
) => Result<User, SignUpUserError>;

export const makeSignUpUserUseCase = (
  { createUser }: SignUpUserDependencies,
): SignUpUserUseCase =>
  (details) => {
    const validDetails = makeUserDetails(details);
    if (!validDetails.ok) return validDetails;

    return createUser({ details: validDetails.value });
  };
