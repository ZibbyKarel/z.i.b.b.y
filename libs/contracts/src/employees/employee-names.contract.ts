import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  CreateEmployeeNameSchema,
  EmployeeNameIdSchema,
  EmployeeNameSchema,
  UpdateEmployeeNameSchema,
} from "./employee.schema";

const c = initContract();

/**
 * CRUD over the name pool (D-015): a small, file-backed "table" seeded with 30
 * Minion-style names (System → Registries → Names). A name is used by at most one
 * active employee at a time — `EmployeeName.employeeId` is set while held, cleared
 * on fire.
 */
export const employeeNamesContract = c.router(
  {
    listEmployeeNames: {
      method: "GET",
      path: "/employee-names",
      responses: { 200: z.array(EmployeeNameSchema) },
      summary: "List the name pool, seeded on first read if the store is absent",
    },

    createEmployeeName: {
      method: "POST",
      path: "/employee-names",
      body: CreateEmployeeNameSchema,
      responses: { 201: EmployeeNameSchema, 409: ErrorSchema },
      summary: "Add a name to the pool. 409 when the name already exists",
    },

    updateEmployeeName: {
      method: "PATCH",
      path: "/employee-names/:id",
      pathParams: z.object({ id: EmployeeNameIdSchema }),
      body: UpdateEmployeeNameSchema,
      responses: { 200: EmployeeNameSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Rename a pool entry. 409 when the new name is already taken",
    },

    deleteEmployeeName: {
      method: "DELETE",
      path: "/employee-names/:id",
      pathParams: z.object({ id: EmployeeNameIdSchema }),
      responses: {
        200: z.object({ id: EmployeeNameIdSchema }),
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary: "Remove a pool entry. 409 while it is held by an active employee",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type EmployeeNamesContract = typeof employeeNamesContract;
