import type { Role } from '../../../../shared/domain/role.enum';

export interface IssueAccessTokenInput {
  readonly userId: string;
  readonly role: Role;
  readonly sessionId: string;
}

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface ITokenService {
  issueAccessToken(input: IssueAccessTokenInput): Promise<IssuedAccessToken>;
}

export const I_TOKEN_SERVICE: unique symbol = Symbol('ITokenService');
