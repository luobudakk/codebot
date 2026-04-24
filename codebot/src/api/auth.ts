import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type ApiRole = "admin" | "operator" | "viewer";
export interface ApiTokenRecord {
  token: string;
  role: ApiRole;
}

export class AuthManager {
  private tokenFile = "";
  private tokens = new Map<string, ApiRole>();

  constructor(private readonly dataDir: string, seedTokens: ApiTokenRecord[]) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.tokenFile = path.join(dataDir, "auth-tokens.json");
    if (fs.existsSync(this.tokenFile)) {
      const fromFile = JSON.parse(fs.readFileSync(this.tokenFile, "utf8")) as ApiTokenRecord[];
      for (const item of fromFile) this.tokens.set(item.token, item.role);
    } else {
      for (const item of seedTokens) this.tokens.set(item.token, item.role);
      this.flush();
    }
  }

  getRole(token: string | undefined): ApiRole | undefined {
    if (!token) return undefined;
    return this.tokens.get(token);
  }

  hasRole(token: string | undefined, allowed: ApiRole[]): boolean {
    const role = this.getRole(token);
    return !!role && allowed.includes(role);
  }

  rotate(role: ApiRole): ApiTokenRecord {
    const token = `cb_${randomBytes(16).toString("hex")}`;
    const record: ApiTokenRecord = { token, role };
    this.tokens.set(record.token, record.role);
    this.flush();
    return record;
  }

  list(): Array<{ role: ApiRole; tokenMasked: string }> {
    return [...this.tokens.entries()].map(([token, role]) => ({
      role,
      tokenMasked: `${token.slice(0, 6)}...${token.slice(-4)}`
    }));
  }

  private flush(): void {
    const rows = [...this.tokens.entries()].map(([token, role]) => ({ token, role }));
    fs.writeFileSync(this.tokenFile, JSON.stringify(rows, null, 2), "utf8");
  }
}
