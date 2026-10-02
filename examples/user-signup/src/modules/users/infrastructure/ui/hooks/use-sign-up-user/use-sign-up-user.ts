import { useState } from "react";
import type { SignUpUserError } from "../../../../application/use-cases/sign-up-user";
import type { UserDetails } from "../../../../domain/entities/user";
import { signUpUser as signUpUserUseCase } from "../../compositions/users-composition";

const errorMessageFor = ({ type }: SignUpUserError): string => {
  switch (type) {
    case "InvalidName":
      return "Enter your name.";
    case "InvalidEmail":
      return "Enter a valid email address.";
    case "InvalidUserId":
      return "Could not create a user ID.";
    case "DuplicateEmail":
      return "That email is already registered.";
    case "InvalidStoredUsers":
      return "Saved user data is invalid.";
    case "StorageUnavailable":
      return "Browser storage is unavailable.";
  }
};

export const useSignUpUser = () => {
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearOutcome = () => {
    setRegisteredName(null);
    setErrorMessage(null);
  };

  const signUpUser = (details: UserDetails): boolean => {
    const result = signUpUserUseCase(details);
    if (!result.ok) {
      setRegisteredName(null);
      setErrorMessage(errorMessageFor(result.error));
      return false;
    }

    setRegisteredName(result.value.name);
    setErrorMessage(null);
    return true;
  };

  return { signUpUser, registeredName, errorMessage, clearOutcome };
};
