import { useState } from "react";
import type { UserDetails } from "../../../../domain/entities/user";
import { signUpFormSchema } from "../../schemas/sign-up-form-schema";

export const useSignUpForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const onNameChange = (value: string) => {
    setName(value);
    setValidationMessage(null);
  };

  const onEmailChange = (value: string) => {
    setEmail(value);
    setValidationMessage(null);
  };

  const readValues = (): UserDetails | null => {
    const parsed = signUpFormSchema.safeParse({ name, email });
    if (!parsed.success) {
      setValidationMessage(parsed.error.issues[0]?.message ?? "Check your details.");
      return null;
    }

    setValidationMessage(null);
    return parsed.data;
  };

  const reset = () => {
    setName("");
    setEmail("");
  };

  return { name, email, onNameChange, onEmailChange, validationMessage, readValues, reset };
};
