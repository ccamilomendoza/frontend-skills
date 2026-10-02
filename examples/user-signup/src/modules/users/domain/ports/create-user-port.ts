import type { Result } from "../../../shared/domain/results/result";
import type { User, UserDetails } from "../entities/user";
import type { UserDomainError } from "../services/user-creation";

export interface CreateUserPortRequest {
  readonly details: UserDetails;
}

export type CreateUserPortError =
  | UserDomainError
  | { readonly type: "DuplicateEmail" }
  | { readonly type: "InvalidStoredUsers" }
  | { readonly type: "StorageUnavailable" };

export type CreateUserPort = (
  request: CreateUserPortRequest,
) => Result<User, CreateUserPortError>;
