import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  CreateEmployeeSchema,
  EmployeeIdSchema,
  EmployeeQuerySchema,
  EmployeeSchema,
  EmployeeWithStateSchema,
  UpdateEmployeeSchema,
} from "./employee.schema";

const c = initContract();

/**
 * CRUD over the employee registry (D-015): hire/fire and roster reads. `hireEmployee`
 * hangs off `/departments/:id/employees` (the department is the natural parent of
 * hiring), everything else off `/employees`. `pathParams.id` on the department route
 * is a plain string, not `DepartmentIdSchema` — mirrors `departmentsContract`'s own
 * `getDepartment`/`getRoster`: an id outside the enum must reach the handler and come
 * back as this contract's declared 404 rather than ts-rest's generic 400.
 */
export const employeesContract = c.router(
  {
    listEmployees: {
      method: "GET",
      path: "/employees",
      query: EmployeeQuerySchema,
      responses: { 200: z.array(EmployeeWithStateSchema) },
      summary: "List employees, optionally filtered by department/agentId/status",
    },

    getEmployee: {
      method: "GET",
      path: "/employees/:id",
      pathParams: z.object({ id: EmployeeIdSchema }),
      responses: { 200: EmployeeWithStateSchema, 404: ErrorSchema },
      summary: "Get a single employee by id, with its derived state",
    },

    hireEmployee: {
      method: "POST",
      path: "/departments/:id/employees",
      pathParams: z.object({ id: z.string() }),
      body: CreateEmployeeSchema,
      responses: {
        201: EmployeeSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary:
        "Hire an employee of a position (agentId) into a department. 409 when the requested/random name is taken or the pool is empty",
    },

    updateEmployee: {
      method: "PATCH",
      path: "/employees/:id",
      pathParams: z.object({ id: EmployeeIdSchema }),
      body: UpdateEmployeeSchema,
      responses: {
        200: EmployeeSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary: "Rename (must pick a free name) and/or move an employee to another department",
    },

    fireEmployee: {
      method: "DELETE",
      path: "/employees/:id",
      pathParams: z.object({ id: EmployeeIdSchema }),
      responses: {
        200: EmployeeSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary:
        "Fire an employee (soft: status becomes fired, its name returns to the pool). 409 while it holds a leased run",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type EmployeesContract = typeof employeesContract;
