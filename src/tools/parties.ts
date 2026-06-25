import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import {
  EntityParticipantRepository,
  OrganizationRepository,
  ParticipantRoleTypeRepository,
  PartyContactPointRepository,
  PartyRelationshipRepository,
  PersonRepository,
  RelationshipTypeRepository
} from "../repositories/parties.js";

const salutationSchema = z.enum(["mr", "mrs", "unknown"]);
const contactPointTypeSchema = z.enum(["email", "phone", "whatsapp", "signal", "telegram", "linkedin", "website", "other"]);
const participantEntityTypeSchema = z.enum(["initiative", "task", "calendar_entry"]);

const listPeopleInput = z.object({ search: z.string().trim().min(1).optional() }).passthrough();
const getPartyInput = z.object({ id: z.number().int().positive() });
const createPersonInput = z.object({
  firstName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
  salutation: salutationSchema.optional(),
  academicTitle: z.string().trim().min(1).nullable().optional(),
  nameSuffix: z.string().trim().min(1).nullable().optional(),
  description: z.string().nullable().optional()
});
const updatePersonInput = createPersonInput.partial().extend({ id: z.number().int().positive() });

const listOrganizationsInput = z.object({ search: z.string().trim().min(1).optional() }).passthrough();
const createOrganizationInput = z.object({
  name: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  legalName: z.string().trim().min(1).nullable().optional(),
  organizationType: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().nullable().optional()
});
const updateOrganizationInput = createOrganizationInput.partial().extend({ id: z.number().int().positive() });

const listPartyRelationshipsInput = z
  .object({
    partyId: z.number().int().positive().optional(),
    relationshipTypeId: z.number().int().positive().optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .passthrough();
const createPartyRelationshipInput = z.object({
  fromPartyId: z.number().int().positive(),
  toPartyId: z.number().int().positive(),
  relationshipTypeId: z.number().int().positive(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  startedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional()
});
const deleteByIdInput = z.object({ id: z.number().int().positive(), confirmed: z.boolean().optional() });

const listParticipantRoleTypesInput = z.object({ appliesToEntityType: participantEntityTypeSchema.optional() }).passthrough();
const listEntityParticipantsInput = z
  .object({
    partyId: z.number().int().positive().optional(),
    entityType: participantEntityTypeSchema.optional(),
    entityId: z.number().int().positive().optional()
  })
  .passthrough();
const createEntityParticipantInput = z.object({
  partyId: z.number().int().positive(),
  entityType: participantEntityTypeSchema,
  entityId: z.number().int().positive(),
  roleTypeId: z.number().int().positive().nullable().optional(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional()
});

const listContactPointsInput = z
  .object({
    partyId: z.number().int().positive(),
    type: contactPointTypeSchema.optional()
  })
  .passthrough();
const createContactPointInput = z.object({
  partyId: z.number().int().positive(),
  type: contactPointTypeSchema,
  label: z.string().trim().min(1).nullable().optional(),
  value: z.string().trim().min(1),
  normalizedValue: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional(),
  isPreferred: z.boolean().optional(),
  canSend: z.boolean().optional(),
  canReceive: z.boolean().optional(),
  provider: z.string().trim().min(1).nullable().optional()
});
const updateContactPointInput = createContactPointInput.partial().extend({ id: z.number().int().positive() });

export const partyTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listPeople",
    description: "List people in DMAX's Who dimension. Optional search matches display names.",
    inputSchema: listPeopleInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new PersonRepository(context.db).list(input) };
    }
  }),
  defineTool({
    name: "getPerson",
    description: "Get one person by party id, including salutation and name fields.",
    inputSchema: getPartyInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      const person = new PersonRepository(context.db).findById(input.id);
      return person ? { ok: true, data: person } : { ok: false, error: `Person not found: ${input.id}` };
    }
  }),
  defineTool({
    name: "createPerson",
    description:
      "Create a person. Use salutation=mr, mrs, or unknown for address-form purposes. Provide firstName or lastName; the person name is derived from those fields. Use description for free-text person notes.",
    inputSchema: createPersonInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PersonRepository(context.db).create(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create person" };
      }
    }
  }),
  defineTool({
    name: "updatePerson",
    description: "Update a person by party id, including free-text description when useful.",
    inputSchema: updatePersonInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PersonRepository(context.db).update(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to update person" };
      }
    }
  }),
  defineTool({
    name: "listOrganizations",
    description: "List organizations in DMAX's Who dimension. Optional search matches display names.",
    inputSchema: listOrganizationsInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new OrganizationRepository(context.db).list(input) };
    }
  }),
  defineTool({
    name: "getOrganization",
    description: "Get one organization by party id.",
    inputSchema: getPartyInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      const organization = new OrganizationRepository(context.db).findById(input.id);
      return organization ? { ok: true, data: organization } : { ok: false, error: `Organization not found: ${input.id}` };
    }
  }),
  defineTool({
    name: "createOrganization",
    description: "Create an organization. Organizations are party actors and can contain people through relationships such as works_for or member_of.",
    inputSchema: createOrganizationInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new OrganizationRepository(context.db).create(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create organization" };
      }
    }
  }),
  defineTool({
    name: "updateOrganization",
    description: "Update an organization by party id.",
    inputSchema: updateOrganizationInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new OrganizationRepository(context.db).update(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to update organization" };
      }
    }
  }),
  defineTool({
    name: "listRelationshipTypes",
    description: "List configured relationship types such as works_for, founder_of, knows, partner_of, and mentor_of.",
    inputSchema: z.object({}).passthrough(),
    run: (_input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new RelationshipTypeRepository(context.db).list() };
    }
  }),
  defineTool({
    name: "listPartyRelationships",
    description: "List relationships between people and organizations. Filter by partyId to inspect one party's graph.",
    inputSchema: listPartyRelationshipsInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new PartyRelationshipRepository(context.db).list(input) };
    }
  }),
  defineTool({
    name: "createPartyRelationship",
    description:
      "Create a relationship between two parties. Symmetric relationship types are normalized so A-B and B-A are the same relationship.",
    inputSchema: createPartyRelationshipInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PartyRelationshipRepository(context.db).create(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create party relationship" };
      }
    }
  }),
  defineTool({
    name: "deletePartyRelationship",
    description: "Delete one relationship between parties. Requires confirmation.",
    inputSchema: deleteByIdInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      const deleted = new PartyRelationshipRepository(context.db).delete(input.id);
      return deleted ? { ok: true, data: { deleted: true, ...deleted } } : { ok: false, error: `Party relationship not found: ${input.id}` };
    }
  }),
  defineTool({
    name: "listParticipantRoleTypes",
    description: "List configured role types for assigning people or organizations to initiatives, tasks, or calendar entries.",
    inputSchema: listParticipantRoleTypesInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new ParticipantRoleTypeRepository(context.db).list(input) };
    }
  }),
  defineTool({
    name: "listEntityParticipants",
    description: "List people or organizations assigned to initiatives, tasks, or calendar entries.",
    inputSchema: listEntityParticipantsInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new EntityParticipantRepository(context.db).list(input) };
    }
  }),
  defineTool({
    name: "createEntityParticipant",
    description:
      "Assign a person or organization to an initiative, task, or calendar entry with an optional role. Categories are not valid participant targets.",
    inputSchema: createEntityParticipantInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new EntityParticipantRepository(context.db).create(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create entity participant" };
      }
    }
  }),
  defineTool({
    name: "deleteEntityParticipant",
    description: "Remove one person or organization assignment from an initiative, task, or calendar entry. Requires confirmation.",
    inputSchema: deleteByIdInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      const deleted = new EntityParticipantRepository(context.db).delete(input.id);
      return deleted ? { ok: true, data: { deleted: true, ...deleted } } : { ok: false, error: `Entity participant not found: ${input.id}` };
    }
  }),
  defineTool({
    name: "listPartyContactPoints",
    description: "List contact points for one person or organization.",
    inputSchema: listContactPointsInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new PartyContactPointRepository(context.db).list(input) };
    }
  }),
  defineTool({
    name: "createPartyContactPoint",
    description: "Create a contact point such as email, phone, WhatsApp, Signal, Telegram, LinkedIn, website, or other.",
    inputSchema: createContactPointInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PartyContactPointRepository(context.db).create(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create contact point" };
      }
    }
  }),
  defineTool({
    name: "updatePartyContactPoint",
    description: "Update a contact point for one person or organization.",
    inputSchema: updateContactPointInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PartyContactPointRepository(context.db).update(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to update contact point" };
      }
    }
  })
];
