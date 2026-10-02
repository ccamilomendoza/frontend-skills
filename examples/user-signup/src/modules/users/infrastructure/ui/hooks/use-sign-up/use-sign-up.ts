import type { FormEventHandler } from "react";
import { useSignUpForm } from "../use-sign-up-form/use-sign-up-form";
import { useSignUpUser } from "../use-sign-up-user/use-sign-up-user";

export const useSignUp = () => {
  const {
    name,
    email,
    validationMessage,
    readValues,
    reset,
    onNameChange: changeName,
    onEmailChange: changeEmail,
  } = useSignUpForm();
  const { signUpUser, registeredName, errorMessage, clearOutcome } = useSignUpUser();

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const values = readValues();
    if (!values) {
      clearOutcome();
      return;
    }

    if (signUpUser(values)) reset();
  };

  const onNameChange = (value: string) => {
    changeName(value);
    clearOutcome();
  };

  const onEmailChange = (value: string) => {
    changeEmail(value);
    clearOutcome();
  };

  return {
    name,
    email,
    onNameChange,
    onEmailChange,
    onSubmit,
    validationMessage,
    errorMessage,
    registeredName,
  };
};
