# User sign up example

A small React example following `hexagonal-frontend-permissive-system` and
`react-hexagonal-ui-system`. It creates users with a name and email and saves
them in browser localStorage. It does not implement authentication.

Run it with Node 20.19+ or 22.12+:

```sh
cd examples/user-signup
npm install
npm run dev
```

The path through the code is:

```text
SignUpForm (renders fields)
  -> SignUp (container)
  -> useSignUp (form submission)
  -> useSignUpUser (UI state and messages)
  -> signUpUser (bound use case)
  -> makeSignUpUserUseCase (validates input)
  -> CreateUserPort (domain contract)
  -> localStorage adapter (validates stored DTOs and persists the user)
```

The adapter reads stored JSON as `unknown`, parses it with Zod, maps each DTO,
and calls the domain smart constructor before using any stored user. The
localStorage API is synchronous, so the port and use case are synchronous too.

There is one feature and one page. The user module composes its own adapter;
there is no cross-module composition or route tree requiring `modules/app`.
