import { zodResolver as _zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

// @hookform/resolvers 5.4.0 types were compiled against zod 4.0.x (_zod.version.minor = 0)
// but our workspace has zod 4.4.x (_zod.version.minor = 4). The library handles both at
// runtime; this shim bridges the TypeScript structural incompatibility.
export function zodResolver<TOutput extends FieldValues>(
  schema: ZodType<TOutput>,
): Resolver<TOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _zodResolver(schema as any);
}
