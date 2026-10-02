import { makeSignUpUserUseCase } from "../../../application/use-cases/sign-up-user";
import { makeLocalStorageCreateUserAdapter } from "../../server/adapters/local-storage-create-user-adapter";

export const signUpUser = makeSignUpUserUseCase({
  createUser: makeLocalStorageCreateUserAdapter({
    getStorage: () => window.localStorage,
    createId: () => crypto.randomUUID(),
  }),
});
