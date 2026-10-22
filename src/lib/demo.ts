export type DemoScenario = {
  id: string;
  label: string;
  docs: string;
  change: string;
};

const TODO_DOCS = `# Todo API v1

## GET /tasks
Returns a list of tasks. Each item: id (int), title (string), dueDate (string, DD-MM-YYYY).

## GET /tasks/{id}
Returns a single task by id. 404 if not found.

## POST /tasks
Creates a task. Body: title (required), dueDate (optional, DD-MM-YYYY). Returns 201 with the created task.

## PUT /tasks/{id}
Updates title and dueDate (DD-MM-YYYY) of a task. Returns 200 with the updated task, 404 if not found.

## DELETE /tasks/{id}
Deletes a task. Returns 204, 404 if not found.`;

const TODO_CHANGE = `Add a required 'priority' field (low|medium|high) to POST /tasks and PUT /tasks/{id}, and change 'dueDate' from DD-MM-YYYY to ISO-8601. Requests using the old date format must be rejected with 400.`;

const DMS_DOCS = `# AutoDMS API v2 — Automotive Dealer Management System

## GET /inventory
Returns vehicles in stock. Each item: vin (string, 17 chars), make, model, year (int), status (string: available|reserved|sold), price (number, USD).

## GET /inventory/{vin}
Returns a single vehicle by VIN. 404 if not found.

## POST /sales
Creates a sale. Body: vin (required), buyerId (required), salePrice (required, USD), saleDate (optional, MM-DD-YYYY). Returns 201 with saleId. Marks the vehicle status as sold.

## PUT /sales/{saleId}
Updates salePrice and saleDate (MM-DD-YYYY) of a sale. Returns 200, 404 if not found. Does not change vehicle status.

## POST /service
Books a service appointment. Body: vin (required), serviceType (required: oil|tires|brakes|inspection), slotDate (optional, MM-DD-YYYY). Returns 201 with appointmentId.

## GET /service/{appointmentId}
Returns an appointment by id. 404 if not found.

## DELETE /service/{appointmentId}
Cancels an appointment. Returns 204, 404 if not found.`;

const DMS_CHANGE = `Change all dates (saleDate, slotDate) from MM-DD-YYYY to ISO-8601 and reject the old format with 422. Add a required 'salespersonId' to POST /sales. When a sale is created, set the vehicle status to 'pending-delivery' instead of 'sold' until delivery is confirmed via a new delivery workflow.`;

const CRM_DOCS = `# Enterprise CRM API v3 — Customer Relationship Management

## GET /accounts
Returns customer accounts. Each item: accountId (string), name, tier (string: standard|premium), creditLimit (number, USD), ownerId (string).

## GET /accounts/{accountId}
Returns a single account. 404 if not found.

## POST /accounts
Creates an account. Body: name (required), tier (optional, default standard), creditLimit (optional, USD). Returns 201 with accountId.

## PUT /accounts/{accountId}/tier
Changes the account tier. Body: tier (required: standard|premium). Returns 200 with the updated account. Downgrades take effect at the next billing cycle.

## GET /accounts/{accountId}/contacts
Lists contacts for an account. Each item: contactId, email, role (string).

## POST /opportunities
Creates a sales opportunity. Body: accountId (required), amount (required, USD), stage (required: prospect|negotiation|closed-won|closed-lost). Returns 201 with opportunityId.

## PUT /opportunities/{opportunityId}
Updates amount and stage of an opportunity. Returns 200, 404 if not found. Moving to closed-won triggers commission calculation using the account tier at close time.

## GET /opportunities?accountId={id}
Lists opportunities for an account.`;

const CRM_CHANGE = `Introduce a new 'enterprise' tier between premium features and custom pricing: add 'enterprise' as an allowed tier value, require 'creditLimit' for enterprise accounts with a minimum of 100000 USD, and base commission calculation on the tier at opportunity creation time instead of close time. Existing premium accounts stay unchanged unless explicitly upgraded.`;

export const DEMO_SCENARIOS: DemoScenario[] = [
  { id: "todo", label: "Todo API — priority + ISO dates", docs: TODO_DOCS, change: TODO_CHANGE },
  { id: "autodms", label: "AutoDMS — dealer sales + service dates", docs: DMS_DOCS, change: DMS_CHANGE },
  { id: "crm", label: "Enterprise CRM — new enterprise tier", docs: CRM_DOCS, change: CRM_CHANGE },
];

// Backwards-compatible defaults (Todo scenario).
export const DEMO_DOCS = TODO_DOCS;
export const DEMO_CHANGE = TODO_CHANGE;
