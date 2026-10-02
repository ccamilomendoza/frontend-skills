import { err, ok } from "../../../../shared/domain/results/result";
import type { User } from "../../../domain/entities/user";
import { makeUser } from "../../../domain/services/user-creation";
import type { CreateUserPort } from "../../../domain/ports/create-user-port";
import { storedUserToMakeUserArgs, userToStoredUser } from "../mappers/stored-user-mapper";
import { storedUsersSchema } from "../schemas/stored-user-schema";

const storageKey = "hexagonal-signup-users";

export interface LocalStorageCreateUserAdapterDependencies {
  readonly getStorage: () => Pick<Storage, "getItem" | "setItem">;
  readonly createId: () => string;
}

export const makeLocalStorageCreateUserAdapter = (
  { getStorage, createId }: LocalStorageCreateUserAdapterDependencies,
): CreateUserPort =>
  ({ details }) => {
    let raw: string | null;
    try {
      raw = getStorage().getItem(storageKey);
    } catch {
      return err({ type: "StorageUnavailable" });
    }

    let users: User[] = [];
    if (raw !== null) {
      let stored: unknown;
      try {
        stored = JSON.parse(raw) as unknown;
      } catch {
        return err({ type: "InvalidStoredUsers" });
      }

      const parsed = storedUsersSchema.safeParse(stored);
      if (!parsed.success) return err({ type: "InvalidStoredUsers" });

      users = [];
      for (const dto of parsed.data) {
        const user = makeUser(storedUserToMakeUserArgs(dto));
        if (!user.ok) return err({ type: "InvalidStoredUsers" });
        users.push(user.value);
      }
    }

    if (users.some(({ email }) => email === details.email)) {
      return err({ type: "DuplicateEmail" });
    }

    const user = makeUser({ id: createId(), ...details });
    if (!user.ok) return user;

    try {
      getStorage().setItem(
        storageKey,
        JSON.stringify([...users, user.value].map(userToStoredUser)),
      );
    } catch {
      return err({ type: "StorageUnavailable" });
    }

    return ok(user.value);
  };
