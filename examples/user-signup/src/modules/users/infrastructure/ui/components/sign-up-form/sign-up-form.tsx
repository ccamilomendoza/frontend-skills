import type { FormEventHandler } from "react";

interface SignUpFormProps {
  readonly name: string;
  readonly email: string;
  readonly onNameChange: (value: string) => void;
  readonly onEmailChange: (value: string) => void;
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  readonly validationMessage: string | null;
  readonly errorMessage: string | null;
  readonly registeredName: string | null;
}

export const SignUpForm = ({
  name,
  email,
  onNameChange,
  onEmailChange,
  onSubmit,
  validationMessage,
  errorMessage,
  registeredName,
}: SignUpFormProps) => (
  <form onSubmit={onSubmit} noValidate>
    <label htmlFor="name">Name</label>
    <input
      id="name"
      name="name"
      autoComplete="name"
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
    />

    <label htmlFor="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      autoComplete="email"
      value={email}
      onChange={(event) => onEmailChange(event.target.value)}
    />

    <button type="submit">Create user</button>

    {validationMessage && <p role="alert">{validationMessage}</p>}
    {errorMessage && <p role="alert">{errorMessage}</p>}
    {registeredName && <p role="status">Created user: {registeredName}</p>}
  </form>
);
