export interface UserDetails {
  readonly name: string;
  readonly email: string;
}

export interface User extends UserDetails {
  readonly id: string;
}
