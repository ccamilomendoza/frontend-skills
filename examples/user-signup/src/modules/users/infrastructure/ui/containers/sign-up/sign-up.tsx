import { SignUpForm } from "../../components/sign-up-form/sign-up-form";
import { useSignUp } from "../../hooks/use-sign-up/use-sign-up";

export const SignUp = () => {
  const signUp = useSignUp();
  return <SignUpForm {...signUp} />;
};
