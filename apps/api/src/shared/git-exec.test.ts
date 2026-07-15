import { describe, expect, it } from "vitest";
import { InvalidGitRemoteError, isValidGitRemote, validateRemote } from "./git-exec";

describe("isValidGitRemote / validateRemote (Task 8 — clone remote allowlist)", () => {
  const legit = [
    "https://github.com/acme/alpha.git",
    "ssh://git@github.com/acme/alpha.git",
    "git@github.com:acme/alpha.git",
  ];

  it.each(legit)("accepts %s", (url) => {
    expect(isValidGitRemote(url)).toBe(true);
    expect(() => validateRemote(url)).not.toThrow();
  });

  const malicious: Array<[label: string, url: string]> = [
    ["leading-dash option-injection value", "--upload-pack=/bin/sh"],
    ["leading-dash proxy flag", "-oProxyCommand=x"],
    ["file:// local-path exfil", "file:///etc/passwd"],
    ["ext:: transport RCE", 'ext::sh -c "id"'],
    ["bare local path (no scheme)", "/tmp/x"],
    ["git:// unauthenticated (locked reject)", "git://github.com/x"],
    // CVE-2017-1000117 class: leading-dash authority (host/user) — ssh-option injection.
    ["scp-like leading-dash host (ssh-option injection)", "git@-oProxyCommand:evil"],
    ["ssh:// leading-dash user (ssh-option injection)", "ssh://-oProxyCommand@host/x"],
    ["ssh:// leading-dash host (ssh-option injection)", "ssh://user@-host/x"],
    ["scp-like leading-dash host, short form", "git@-h:path"],
  ];

  it.each(malicious)("rejects %s: %s", (_label, url) => {
    expect(isValidGitRemote(url)).toBe(false);
    expect(() => validateRemote(url)).toThrow(InvalidGitRemoteError);
  });

  it("the thrown error carries the offending remote and a stable name", () => {
    try {
      validateRemote('ext::sh -c "id"');
      expect.unreachable("validateRemote should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidGitRemoteError);
      expect((error as InvalidGitRemoteError).name).toBe("InvalidGitRemoteError");
      expect((error as InvalidGitRemoteError).remote).toBe('ext::sh -c "id"');
    }
  });
});
