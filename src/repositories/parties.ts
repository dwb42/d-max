import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type PartyType = "person" | "organization";
export type PersonSalutation = "mr" | "mrs" | "unknown";
export type ContactPointType = "email" | "phone" | "whatsapp" | "signal" | "telegram" | "linkedin" | "website" | "other";

export type Party = {
  id: number;
  type: PartyType;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type Person = Omit<Party, "displayName"> & {
  type: "person";
  firstName: string | null;
  lastName: string | null;
  salutation: PersonSalutation;
  academicTitle: string | null;
  nameSuffix: string | null;
  description: string | null;
};

export type Organization = Party & {
  type: "organization";
  name: string;
  legalName: string | null;
  organizationType: string | null;
  markdown: string;
};

export type RelationshipDirectionality = "directed" | "symmetric";
export type RelationshipStatus = "active" | "inactive";

export type RelationshipType = {
  id: number;
  key: string;
  label: string;
  inverseLabel: string | null;
  directionality: RelationshipDirectionality;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PartyRelationship = {
  id: number;
  fromPartyId: number;
  toPartyId: number;
  relationshipTypeId: number;
  roleLabel: string | null;
  startedOn: string | null;
  endedOn: string | null;
  status: RelationshipStatus;
  createdAt: string;
  updatedAt: string;
};

export type PartyRelationshipWithParties = PartyRelationship & {
  fromParty: Party;
  toParty: Party;
  relationshipType: RelationshipType;
};

export type ParticipantEntityType = "initiative" | "task" | "calendar_entry";

export type ParticipantRoleType = {
  id: number;
  key: string;
  label: string;
  appliesToEntityType: ParticipantEntityType | null;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EntityParticipant = {
  id: number;
  partyId: number;
  entityType: ParticipantEntityType;
  entityId: number;
  roleTypeId: number | null;
  roleLabel: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EntityParticipantWithParty = EntityParticipant & {
  party: Party;
  roleType: ParticipantRoleType | null;
  contactPoints?: PartyContactPoint[];
  relationships?: PartyRelationshipWithParties[];
};

export type PartyContactPoint = {
  id: number;
  partyId: number;
  type: ContactPointType;
  label: string | null;
  value: string;
  normalizedValue: string | null;
  isPrimary: boolean;
  isPreferred: boolean;
  canSend: boolean;
  canReceive: boolean;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartyAddress = {
  id: number;
  partyId: number;
  label: string | null;
  line1: string;
  line2: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

type PartyRow = {
  id: number;
  type: PartyType;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type PersonRow = PartyRow & {
  party_id: number;
  first_name: string | null;
  last_name: string | null;
  salutation: PersonSalutation;
  academic_title: string | null;
  name_suffix: string | null;
  description: string | null;
};

type OrganizationRow = PartyRow & {
  party_id: number;
  name: string;
  legal_name: string | null;
  organization_type: string | null;
  markdown: string;
};

type RelationshipTypeRow = {
  id: number;
  key: string;
  label: string;
  inverse_label: string | null;
  directionality: RelationshipDirectionality;
  is_system: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PartyRelationshipRow = {
  id: number;
  from_party_id: number;
  to_party_id: number;
  relationship_type_id: number;
  role_label: string | null;
  started_on: string | null;
  ended_on: string | null;
  status: RelationshipStatus;
  created_at: string;
  updated_at: string;
};

type PartyRelationshipJoinRow = PartyRelationshipRow & {
  from_party_type: PartyType;
  from_party_display_name: string;
  from_party_created_at: string;
  from_party_updated_at: string;
  to_party_type: PartyType;
  to_party_display_name: string;
  to_party_created_at: string;
  to_party_updated_at: string;
  relationship_type_key: string;
  relationship_type_label: string;
  relationship_type_inverse_label: string | null;
  relationship_type_directionality: RelationshipDirectionality;
  relationship_type_is_system: number;
  relationship_type_sort_order: number;
  relationship_type_created_at: string;
  relationship_type_updated_at: string;
};

type ParticipantRoleTypeRow = {
  id: number;
  key: string;
  label: string;
  applies_to_entity_type: ParticipantEntityType | null;
  is_system: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type EntityParticipantRow = {
  id: number;
  party_id: number;
  entity_type: ParticipantEntityType;
  entity_id: number;
  role_type_id: number | null;
  role_label: string | null;
  is_primary: number;
  created_at: string;
  updated_at: string;
};

type EntityParticipantJoinRow = EntityParticipantRow & {
  party_type: PartyType;
  party_display_name: string;
  party_created_at: string;
  party_updated_at: string;
  role_key: string | null;
  role_label_joined: string | null;
  role_applies_to_entity_type: ParticipantEntityType | null;
  role_is_system: number | null;
  role_sort_order: number | null;
  role_created_at: string | null;
  role_updated_at: string | null;
};

type PartyContactPointRow = {
  id: number;
  party_id: number;
  type: ContactPointType;
  label: string | null;
  value: string;
  normalized_value: string | null;
  is_primary: number;
  is_preferred: number;
  can_send: number;
  can_receive: number;
  provider: string | null;
  created_at: string;
  updated_at: string;
};

type PartyAddressRow = {
  id: number;
  party_id: number;
  label: string | null;
  line1: string;
  line2: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  is_primary: number;
  created_at: string;
  updated_at: string;
};

export type CreatePersonInput = {
  firstName?: string | null;
  lastName?: string | null;
  salutation?: PersonSalutation;
  academicTitle?: string | null;
  nameSuffix?: string | null;
  description?: string | null;
};

export type UpdatePersonInput = Partial<CreatePersonInput> & { id: number };

export type CreateOrganizationInput = {
  name: string;
  displayName?: string;
  legalName?: string | null;
  organizationType?: string | null;
  markdown?: string | null;
};

export type UpdateOrganizationInput = Partial<CreateOrganizationInput> & { id: number };

export type CreateRelationshipTypeInput = {
  key: string;
  label: string;
  inverseLabel?: string | null;
  directionality: RelationshipDirectionality;
  isSystem?: boolean;
  sortOrder?: number;
};

export type UpdateRelationshipTypeInput = Partial<CreateRelationshipTypeInput> & { id: number };

export type CreatePartyRelationshipInput = {
  fromPartyId: number;
  toPartyId: number;
  relationshipTypeId: number;
  roleLabel?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  status?: RelationshipStatus;
};

export type CreateParticipantRoleTypeInput = {
  key: string;
  label: string;
  appliesToEntityType?: ParticipantEntityType | null;
  isSystem?: boolean;
  sortOrder?: number;
};

export type UpdateParticipantRoleTypeInput = Partial<CreateParticipantRoleTypeInput> & { id: number };

export type CreateEntityParticipantInput = {
  partyId: number;
  entityType: ParticipantEntityType;
  entityId: number;
  roleTypeId?: number | null;
  roleLabel?: string | null;
  isPrimary?: boolean;
};

export type UpdateEntityParticipantInput = Partial<Omit<CreateEntityParticipantInput, "partyId" | "entityType" | "entityId">> & {
  id: number;
};

export type CreatePartyContactPointInput = {
  partyId: number;
  type: ContactPointType;
  label?: string | null;
  value: string;
  normalizedValue?: string | null;
  isPrimary?: boolean;
  isPreferred?: boolean;
  canSend?: boolean;
  canReceive?: boolean;
  provider?: string | null;
};

export type UpdatePartyContactPointInput = Partial<Omit<CreatePartyContactPointInput, "partyId">> & { id: number };

export type CreatePartyAddressInput = {
  partyId: number;
  label?: string | null;
  line1: string;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isPrimary?: boolean;
};

export type UpdatePartyAddressInput = Partial<Omit<CreatePartyAddressInput, "partyId">> & { id: number };

export function toParty(row: PartyRow): Party {
  return {
    id: row.id,
    type: row.type,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    type: "person",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    firstName: row.first_name,
    lastName: row.last_name,
    salutation: row.salutation,
    academicTitle: row.academic_title,
    nameSuffix: row.name_suffix,
    description: row.description
  };
}

function toOrganization(row: OrganizationRow): Organization {
  return {
    ...toParty(row),
    type: "organization",
    name: row.name,
    legalName: row.legal_name,
    organizationType: row.organization_type,
    markdown: row.markdown
  };
}

function toRelationshipType(row: RelationshipTypeRow): RelationshipType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    inverseLabel: row.inverse_label,
    directionality: row.directionality,
    isSystem: row.is_system === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPartyRelationship(row: PartyRelationshipRow): PartyRelationship {
  return {
    id: row.id,
    fromPartyId: row.from_party_id,
    toPartyId: row.to_party_id,
    relationshipTypeId: row.relationship_type_id,
    roleLabel: row.role_label,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPartyRelationshipWithParties(row: PartyRelationshipJoinRow): PartyRelationshipWithParties {
  return {
    ...toPartyRelationship(row),
    fromParty: {
      id: row.from_party_id,
      type: row.from_party_type,
      displayName: row.from_party_display_name,
      createdAt: row.from_party_created_at,
      updatedAt: row.from_party_updated_at
    },
    toParty: {
      id: row.to_party_id,
      type: row.to_party_type,
      displayName: row.to_party_display_name,
      createdAt: row.to_party_created_at,
      updatedAt: row.to_party_updated_at
    },
    relationshipType: toRelationshipType({
      id: row.relationship_type_id,
      key: row.relationship_type_key,
      label: row.relationship_type_label,
      inverse_label: row.relationship_type_inverse_label,
      directionality: row.relationship_type_directionality,
      is_system: row.relationship_type_is_system,
      sort_order: row.relationship_type_sort_order,
      created_at: row.relationship_type_created_at,
      updated_at: row.relationship_type_updated_at
    })
  };
}

function toParticipantRoleType(row: ParticipantRoleTypeRow): ParticipantRoleType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    appliesToEntityType: row.applies_to_entity_type,
    isSystem: row.is_system === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toEntityParticipant(row: EntityParticipantRow): EntityParticipant {
  return {
    id: row.id,
    partyId: row.party_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    roleTypeId: row.role_type_id,
    roleLabel: row.role_label,
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toEntityParticipantWithParty(row: EntityParticipantJoinRow): EntityParticipantWithParty {
  return {
    ...toEntityParticipant(row),
    party: {
      id: row.party_id,
      type: row.party_type,
      displayName: row.party_display_name,
      createdAt: row.party_created_at,
      updatedAt: row.party_updated_at
    },
    roleType:
      row.role_key === null
        ? null
        : {
            id: row.role_type_id!,
            key: row.role_key,
            label: row.role_label_joined!,
            appliesToEntityType: row.role_applies_to_entity_type,
            isSystem: row.role_is_system === 1,
            sortOrder: row.role_sort_order!,
            createdAt: row.role_created_at!,
            updatedAt: row.role_updated_at!
          }
  };
}

function toPartyContactPoint(row: PartyContactPointRow): PartyContactPoint {
  return {
    id: row.id,
    partyId: row.party_id,
    type: row.type,
    label: row.label,
    value: row.value,
    normalizedValue: row.normalized_value,
    isPrimary: row.is_primary === 1,
    isPreferred: row.is_preferred === 1,
    canSend: row.can_send === 1,
    canReceive: row.can_receive === 1,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPartyAddress(row: PartyAddressRow): PartyAddress {
  return {
    id: row.id,
    partyId: row.party_id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    postalCode: row.postal_code,
    city: row.city,
    region: row.region,
    country: row.country,
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class PartyRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { type?: PartyType; search?: string } = {}): Party[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }
    if (filters.search?.trim()) {
      conditions.push("lower(display_name) like ?");
      params.push(`%${filters.search.trim().toLowerCase()}%`);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    return (this.db.prepare(`select * from parties ${where} order by type asc, lower(display_name) asc, id asc`).all(...params) as PartyRow[]).map(toParty);
  }

  findById(id: number): Party | null {
    const row = this.db.prepare("select * from parties where id = ?").get(id) as PartyRow | undefined;
    return row ? toParty(row) : null;
  }
}

export class PersonRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { search?: string } = {}): Person[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.search?.trim()) {
      conditions.push("lower(p.display_name) like ?");
      params.push(`%${filters.search.trim().toLowerCase()}%`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(
        `select p.*, pe.*
         from people pe
         join parties p on p.id = pe.party_id
         ${where}
         order by lower(pe.last_name) asc, lower(pe.first_name) asc, lower(p.display_name) asc, p.id asc`
      )
      .all(...params) as PersonRow[];
    return rows.map(toPerson);
  }

  findById(id: number): Person | null {
    const row = this.db.prepare("select p.*, pe.* from people pe join parties p on p.id = pe.party_id where pe.party_id = ?").get(id) as
      | PersonRow
      | undefined;
    return row ? toPerson(row) : null;
  }

  create(input: CreatePersonInput, now = nowIso()): Person {
    const displayName = personDisplayName(input);
    const result = this.db
      .prepare("insert into parties (type, display_name, created_at, updated_at) values ('person', ?, ?, ?)")
      .run(displayName, now, now);
    const partyId = Number(result.lastInsertRowid);
    this.db
      .prepare(
        "insert into people (party_id, first_name, last_name, salutation, academic_title, name_suffix, description, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        partyId,
        clean(input.firstName),
        clean(input.lastName),
        input.salutation ?? "unknown",
        clean(input.academicTitle),
        clean(input.nameSuffix),
        clean(input.description),
        now,
        now
      );
    return this.findById(partyId)!;
  }

  update(input: UpdatePersonInput, now = nowIso()): Person {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Person not found: ${input.id}`);
    }

    const next = {
      firstName: input.firstName === undefined ? existing.firstName : input.firstName,
      lastName: input.lastName === undefined ? existing.lastName : input.lastName,
      salutation: input.salutation ?? existing.salutation,
      academicTitle: input.academicTitle === undefined ? existing.academicTitle : input.academicTitle,
      nameSuffix: input.nameSuffix === undefined ? existing.nameSuffix : input.nameSuffix,
      description: input.description === undefined ? existing.description : input.description
    };
    const displayName = personDisplayName(next);

    this.db.prepare("update parties set display_name = ?, updated_at = ? where id = ? and type = 'person'").run(displayName, now, input.id);
    this.db
      .prepare("update people set first_name = ?, last_name = ?, salutation = ?, academic_title = ?, name_suffix = ?, description = ?, updated_at = ? where party_id = ?")
      .run(clean(next.firstName), clean(next.lastName), next.salutation, clean(next.academicTitle), clean(next.nameSuffix), clean(next.description), now, input.id);
    return this.findById(input.id)!;
  }

  delete(id: number): Person | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from parties where id = ? and type = 'person'").run(id);
    return existing;
  }
}

export class OrganizationRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { search?: string } = {}): Organization[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.search?.trim()) {
      conditions.push("lower(p.display_name) like ?");
      params.push(`%${filters.search.trim().toLowerCase()}%`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(
        `select p.*, o.*
         from organizations o
         join parties p on p.id = o.party_id
         ${where}
         order by lower(o.name) asc, p.id asc`
      )
      .all(...params) as OrganizationRow[];
    return rows.map(toOrganization);
  }

  findById(id: number): Organization | null {
    const row = this.db.prepare("select p.*, o.* from organizations o join parties p on p.id = o.party_id where o.party_id = ?").get(id) as
      | OrganizationRow
      | undefined;
    return row ? toOrganization(row) : null;
  }

  create(input: CreateOrganizationInput, now = nowIso()): Organization {
    const displayName = clean(input.displayName) ?? clean(input.name);
    if (!displayName) {
      throw new Error("Organization name is required");
    }
    const result = this.db
      .prepare("insert into parties (type, display_name, created_at, updated_at) values ('organization', ?, ?, ?)")
      .run(displayName, now, now);
    const partyId = Number(result.lastInsertRowid);
    this.db
      .prepare("insert into organizations (party_id, name, legal_name, organization_type, markdown, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)")
      .run(partyId, clean(input.name), clean(input.legalName), clean(input.organizationType), input.markdown ?? "", now, now);
    return this.findById(partyId)!;
  }

  update(input: UpdateOrganizationInput, now = nowIso()): Organization {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Organization not found: ${input.id}`);
    }
    const name = clean(input.name) ?? existing.name;
    const displayName = clean(input.displayName) ?? name;
    this.db.prepare("update parties set display_name = ?, updated_at = ? where id = ? and type = 'organization'").run(displayName, now, input.id);
    this.db
      .prepare("update organizations set name = ?, legal_name = ?, organization_type = ?, markdown = ?, updated_at = ? where party_id = ?")
      .run(
        name,
        input.legalName === undefined ? existing.legalName : clean(input.legalName),
        input.organizationType === undefined ? existing.organizationType : clean(input.organizationType),
        input.markdown === undefined ? existing.markdown : input.markdown ?? "",
        now,
        input.id
      );
    return this.findById(input.id)!;
  }

  delete(id: number): Organization | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from parties where id = ? and type = 'organization'").run(id);
    return existing;
  }
}

export class RelationshipTypeRepository {
  constructor(private readonly db: Database.Database) {}

  list(): RelationshipType[] {
    return (this.db.prepare("select * from relationship_types order by sort_order asc, lower(label) asc, id asc").all() as RelationshipTypeRow[]).map(
      toRelationshipType
    );
  }

  findById(id: number): RelationshipType | null {
    const row = this.db.prepare("select * from relationship_types where id = ?").get(id) as RelationshipTypeRow | undefined;
    return row ? toRelationshipType(row) : null;
  }

  findByKey(key: string): RelationshipType | null {
    const row = this.db.prepare("select * from relationship_types where key = ?").get(key) as RelationshipTypeRow | undefined;
    return row ? toRelationshipType(row) : null;
  }

  create(input: CreateRelationshipTypeInput, now = nowIso()): RelationshipType {
    const result = this.db
      .prepare(
        "insert into relationship_types (key, label, inverse_label, directionality, is_system, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(input.key, input.label, input.inverseLabel ?? null, input.directionality, input.isSystem ? 1 : 0, input.sortOrder ?? nextSortOrder(this.db, "relationship_types"), now, now);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateRelationshipTypeInput, now = nowIso()): RelationshipType {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Relationship type not found: ${input.id}`);
    }
    this.db
      .prepare("update relationship_types set key = ?, label = ?, inverse_label = ?, directionality = ?, is_system = ?, sort_order = ?, updated_at = ? where id = ?")
      .run(
        input.key ?? existing.key,
        input.label ?? existing.label,
        input.inverseLabel === undefined ? existing.inverseLabel : input.inverseLabel,
        input.directionality ?? existing.directionality,
        input.isSystem === undefined ? (existing.isSystem ? 1 : 0) : input.isSystem ? 1 : 0,
        input.sortOrder ?? existing.sortOrder,
        now,
        input.id
      );
    return this.findById(input.id)!;
  }
}

export class PartyRelationshipRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { partyId?: number; relationshipTypeId?: number; status?: RelationshipStatus } = {}): PartyRelationshipWithParties[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.partyId !== undefined) {
      conditions.push("(r.from_party_id = ? or r.to_party_id = ?)");
      params.push(filters.partyId, filters.partyId);
    }
    if (filters.relationshipTypeId !== undefined) {
      conditions.push("r.relationship_type_id = ?");
      params.push(filters.relationshipTypeId);
    }
    if (filters.status !== undefined) {
      conditions.push("r.status = ?");
      params.push(filters.status);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db.prepare(`${partyRelationshipJoinSql()} ${where} order by r.status asc, rt.sort_order asc, r.id asc`).all(...params) as PartyRelationshipJoinRow[];
    return rows.map(toPartyRelationshipWithParties);
  }

  findById(id: number): PartyRelationshipWithParties | null {
    const row = this.db.prepare(`${partyRelationshipJoinSql()} where r.id = ?`).get(id) as PartyRelationshipJoinRow | undefined;
    return row ? toPartyRelationshipWithParties(row) : null;
  }

  create(input: CreatePartyRelationshipInput, now = nowIso()): PartyRelationshipWithParties {
    const type = new RelationshipTypeRepository(this.db).findById(input.relationshipTypeId);
    if (!type) {
      throw new Error(`Relationship type not found: ${input.relationshipTypeId}`);
    }
    ensurePartyExists(this.db, input.fromPartyId);
    ensurePartyExists(this.db, input.toPartyId);
    if (input.fromPartyId === input.toPartyId) {
      throw new Error("Party relationship cannot point to itself");
    }
    assertValidDateRange(input.startedOn ?? null, input.endedOn ?? null, "Relationship startedOn cannot be after endedOn");

    const normalized = normalizeRelationshipParties(type, input.fromPartyId, input.toPartyId);
    const existingId = this.findExistingId(normalized.fromPartyId, normalized.toPartyId, type.id, input.roleLabel ?? null, input.startedOn ?? null);
    if (existingId) {
      return this.findById(existingId)!;
    }

    const result = this.db
      .prepare(
        `insert into party_relationships
          (from_party_id, to_party_id, relationship_type_id, role_label, started_on, ended_on, status, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalized.fromPartyId,
        normalized.toPartyId,
        type.id,
        clean(input.roleLabel),
        input.startedOn ?? null,
        input.endedOn ?? null,
        input.status ?? "active",
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  delete(id: number): PartyRelationship | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from party_relationships where id = ?").run(id);
    return existing;
  }

  private findExistingId(fromPartyId: number, toPartyId: number, relationshipTypeId: number, roleLabel: string | null, startedOn: string | null): number | null {
    const row = this.db
      .prepare(
        `select id from party_relationships
         where from_party_id = ?
           and to_party_id = ?
           and relationship_type_id = ?
           and role_label is ?
           and started_on is ?`
      )
      .get(fromPartyId, toPartyId, relationshipTypeId, clean(roleLabel), startedOn) as { id: number } | undefined;
    return row?.id ?? null;
  }
}

export class ParticipantRoleTypeRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { appliesToEntityType?: ParticipantEntityType } = {}): ParticipantRoleType[] {
    const rows = filters.appliesToEntityType
      ? (this.db
          .prepare(
            "select * from participant_role_types where applies_to_entity_type is null or applies_to_entity_type = ? order by sort_order asc, lower(label) asc, id asc"
          )
          .all(filters.appliesToEntityType) as ParticipantRoleTypeRow[])
      : (this.db.prepare("select * from participant_role_types order by sort_order asc, lower(label) asc, id asc").all() as ParticipantRoleTypeRow[]);
    return rows.map(toParticipantRoleType);
  }

  findById(id: number): ParticipantRoleType | null {
    const row = this.db.prepare("select * from participant_role_types where id = ?").get(id) as ParticipantRoleTypeRow | undefined;
    return row ? toParticipantRoleType(row) : null;
  }

  findByKey(key: string): ParticipantRoleType | null {
    const row = this.db.prepare("select * from participant_role_types where key = ?").get(key) as ParticipantRoleTypeRow | undefined;
    return row ? toParticipantRoleType(row) : null;
  }

  create(input: CreateParticipantRoleTypeInput, now = nowIso()): ParticipantRoleType {
    const result = this.db
      .prepare(
        "insert into participant_role_types (key, label, applies_to_entity_type, is_system, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(input.key, input.label, input.appliesToEntityType ?? null, input.isSystem ? 1 : 0, input.sortOrder ?? nextSortOrder(this.db, "participant_role_types"), now, now);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateParticipantRoleTypeInput, now = nowIso()): ParticipantRoleType {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Participant role type not found: ${input.id}`);
    }
    this.db
      .prepare("update participant_role_types set key = ?, label = ?, applies_to_entity_type = ?, is_system = ?, sort_order = ?, updated_at = ? where id = ?")
      .run(
        input.key ?? existing.key,
        input.label ?? existing.label,
        input.appliesToEntityType === undefined ? existing.appliesToEntityType : input.appliesToEntityType,
        input.isSystem === undefined ? (existing.isSystem ? 1 : 0) : input.isSystem ? 1 : 0,
        input.sortOrder ?? existing.sortOrder,
        now,
        input.id
      );
    return this.findById(input.id)!;
  }
}

export class EntityParticipantRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { partyId?: number; entityType?: ParticipantEntityType; entityId?: number } = {}): EntityParticipantWithParty[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.partyId !== undefined) {
      conditions.push("ep.party_id = ?");
      params.push(filters.partyId);
    }
    if (filters.entityType !== undefined) {
      conditions.push("ep.entity_type = ?");
      params.push(filters.entityType);
    }
    if (filters.entityId !== undefined) {
      conditions.push("ep.entity_id = ?");
      params.push(filters.entityId);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`${entityParticipantJoinSql()} ${where} order by ep.is_primary desc, prt.sort_order asc, lower(p.display_name) asc, ep.id asc`)
      .all(...params) as EntityParticipantJoinRow[];
    return rows.map((row) => this.withPartyDetails(toEntityParticipantWithParty(row)));
  }

  findById(id: number): EntityParticipantWithParty | null {
    const row = this.db.prepare(`${entityParticipantJoinSql()} where ep.id = ?`).get(id) as EntityParticipantJoinRow | undefined;
    return row ? this.withPartyDetails(toEntityParticipantWithParty(row)) : null;
  }

  create(input: CreateEntityParticipantInput, now = nowIso()): EntityParticipantWithParty {
    ensurePartyExists(this.db, input.partyId);
    ensureParticipantEntityExists(this.db, input.entityType, input.entityId);
    if (input.roleTypeId !== undefined && input.roleTypeId !== null) {
      const role = new ParticipantRoleTypeRepository(this.db).findById(input.roleTypeId);
      if (!role) {
        throw new Error(`Participant role type not found: ${input.roleTypeId}`);
      }
      if (role.appliesToEntityType && role.appliesToEntityType !== input.entityType) {
        throw new Error(`Participant role ${role.key} does not apply to ${input.entityType}`);
      }
    }

    const existingId = this.findExistingId(input.partyId, input.entityType, input.entityId, input.roleTypeId ?? null, input.roleLabel ?? null);
    if (existingId) {
      return this.findById(existingId)!;
    }

    const result = this.db
      .prepare(
        "insert into entity_participants (party_id, entity_type, entity_id, role_type_id, role_label, is_primary, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(input.partyId, input.entityType, input.entityId, input.roleTypeId ?? null, clean(input.roleLabel), input.isPrimary ? 1 : 0, now, now);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateEntityParticipantInput, now = nowIso()): EntityParticipantWithParty {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Entity participant not found: ${input.id}`);
    }
    const roleTypeId = input.roleTypeId === undefined ? existing.roleTypeId : input.roleTypeId;
    if (roleTypeId !== null) {
      const role = new ParticipantRoleTypeRepository(this.db).findById(roleTypeId);
      if (!role) {
        throw new Error(`Participant role type not found: ${roleTypeId}`);
      }
      if (role.appliesToEntityType && role.appliesToEntityType !== existing.entityType) {
        throw new Error(`Participant role ${role.key} does not apply to ${existing.entityType}`);
      }
    }
    this.db
      .prepare("update entity_participants set role_type_id = ?, role_label = ?, is_primary = ?, updated_at = ? where id = ?")
      .run(
        roleTypeId,
        input.roleLabel === undefined ? existing.roleLabel : clean(input.roleLabel),
        input.isPrimary === undefined ? (existing.isPrimary ? 1 : 0) : input.isPrimary ? 1 : 0,
        now,
        input.id
      );
    return this.findById(input.id)!;
  }

  delete(id: number): EntityParticipant | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from entity_participants where id = ?").run(id);
    return existing;
  }

  private findExistingId(
    partyId: number,
    entityType: ParticipantEntityType,
    entityId: number,
    roleTypeId: number | null,
    roleLabel: string | null
  ): number | null {
    const row = this.db
      .prepare(
        `select id from entity_participants
         where party_id = ?
           and entity_type = ?
           and entity_id = ?
           and role_type_id is ?
           and role_label is ?`
      )
      .get(partyId, entityType, entityId, roleTypeId, clean(roleLabel)) as { id: number } | undefined;
    return row?.id ?? null;
  }

  private withPartyDetails(participant: EntityParticipantWithParty): EntityParticipantWithParty {
    return {
      ...participant,
      contactPoints: new PartyContactPointRepository(this.db).list({ partyId: participant.partyId }),
      relationships: new PartyRelationshipRepository(this.db).list({ partyId: participant.partyId, status: "active" })
    };
  }
}

export class PartyContactPointRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { partyId?: number; type?: ContactPointType } = {}): PartyContactPoint[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.partyId !== undefined) {
      conditions.push("party_id = ?");
      params.push(filters.partyId);
    }
    if (filters.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    return (this.db
      .prepare(`select * from party_contact_points ${where} order by is_preferred desc, is_primary desc, type asc, id asc`)
      .all(...params) as PartyContactPointRow[]).map(toPartyContactPoint);
  }

  findById(id: number): PartyContactPoint | null {
    const row = this.db.prepare("select * from party_contact_points where id = ?").get(id) as PartyContactPointRow | undefined;
    return row ? toPartyContactPoint(row) : null;
  }

  create(input: CreatePartyContactPointInput, now = nowIso()): PartyContactPoint {
    ensurePartyExists(this.db, input.partyId);
    const normalizedValue = clean(input.normalizedValue) ?? normalizeContactPointValue(input.type, input.value);
    const result = this.db
      .prepare(
        `insert into party_contact_points
          (party_id, type, label, value, normalized_value, is_primary, is_preferred, can_send, can_receive, provider, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.partyId,
        input.type,
        clean(input.label),
        input.value,
        normalizedValue,
        input.isPrimary ? 1 : 0,
        input.isPreferred ? 1 : 0,
        input.canSend ? 1 : 0,
        input.canReceive ? 1 : 0,
        clean(input.provider),
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdatePartyContactPointInput, now = nowIso()): PartyContactPoint {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Party contact point not found: ${input.id}`);
    }
    const type = input.type ?? existing.type;
    const value = input.value ?? existing.value;
    const normalizedValue = input.normalizedValue === undefined ? normalizeContactPointValue(type, value) : clean(input.normalizedValue);
    this.db
      .prepare(
        `update party_contact_points
         set type = ?, label = ?, value = ?, normalized_value = ?, is_primary = ?, is_preferred = ?, can_send = ?, can_receive = ?, provider = ?, updated_at = ?
         where id = ?`
      )
      .run(
        type,
        input.label === undefined ? existing.label : clean(input.label),
        value,
        normalizedValue,
        input.isPrimary === undefined ? (existing.isPrimary ? 1 : 0) : input.isPrimary ? 1 : 0,
        input.isPreferred === undefined ? (existing.isPreferred ? 1 : 0) : input.isPreferred ? 1 : 0,
        input.canSend === undefined ? (existing.canSend ? 1 : 0) : input.canSend ? 1 : 0,
        input.canReceive === undefined ? (existing.canReceive ? 1 : 0) : input.canReceive ? 1 : 0,
        input.provider === undefined ? existing.provider : clean(input.provider),
        now,
        input.id
      );
    cleanupStaleGmailLinksForContactPoint(this.db, input.id);
    return this.findById(input.id)!;
  }

  delete(id: number): PartyContactPoint | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    deleteGmailLinksForContactPoint(this.db, id);
    this.db.prepare("delete from party_contact_points where id = ?").run(id);
    return existing;
  }
}

export class PartyAddressRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { partyId?: number } = {}): PartyAddress[] {
    const rows = filters.partyId
      ? (this.db.prepare("select * from party_addresses where party_id = ? order by is_primary desc, id asc").all(filters.partyId) as PartyAddressRow[])
      : (this.db.prepare("select * from party_addresses order by party_id asc, is_primary desc, id asc").all() as PartyAddressRow[]);
    return rows.map(toPartyAddress);
  }

  findById(id: number): PartyAddress | null {
    const row = this.db.prepare("select * from party_addresses where id = ?").get(id) as PartyAddressRow | undefined;
    return row ? toPartyAddress(row) : null;
  }

  create(input: CreatePartyAddressInput, now = nowIso()): PartyAddress {
    ensurePartyExists(this.db, input.partyId);
    const result = this.db
      .prepare(
        `insert into party_addresses
          (party_id, label, line1, line2, postal_code, city, region, country, is_primary, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.partyId,
        clean(input.label),
        input.line1,
        clean(input.line2),
        clean(input.postalCode),
        clean(input.city),
        clean(input.region),
        clean(input.country),
        input.isPrimary ? 1 : 0,
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdatePartyAddressInput, now = nowIso()): PartyAddress {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Party address not found: ${input.id}`);
    }
    this.db
      .prepare(
        `update party_addresses
         set label = ?, line1 = ?, line2 = ?, postal_code = ?, city = ?, region = ?, country = ?, is_primary = ?, updated_at = ?
         where id = ?`
      )
      .run(
        input.label === undefined ? existing.label : clean(input.label),
        input.line1 ?? existing.line1,
        input.line2 === undefined ? existing.line2 : clean(input.line2),
        input.postalCode === undefined ? existing.postalCode : clean(input.postalCode),
        input.city === undefined ? existing.city : clean(input.city),
        input.region === undefined ? existing.region : clean(input.region),
        input.country === undefined ? existing.country : clean(input.country),
        input.isPrimary === undefined ? (existing.isPrimary ? 1 : 0) : input.isPrimary ? 1 : 0,
        now,
        input.id
      );
    return this.findById(input.id)!;
  }

  delete(id: number): PartyAddress | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from party_addresses where id = ?").run(id);
    return existing;
  }
}

function partyRelationshipJoinSql(): string {
  return `select
    r.*,
    from_party.type as from_party_type,
    from_party.display_name as from_party_display_name,
    from_party.created_at as from_party_created_at,
    from_party.updated_at as from_party_updated_at,
    to_party.type as to_party_type,
    to_party.display_name as to_party_display_name,
    to_party.created_at as to_party_created_at,
    to_party.updated_at as to_party_updated_at,
    rt.key as relationship_type_key,
    rt.label as relationship_type_label,
    rt.inverse_label as relationship_type_inverse_label,
    rt.directionality as relationship_type_directionality,
    rt.is_system as relationship_type_is_system,
    rt.sort_order as relationship_type_sort_order,
    rt.created_at as relationship_type_created_at,
    rt.updated_at as relationship_type_updated_at
  from party_relationships r
  join parties from_party on from_party.id = r.from_party_id
  join parties to_party on to_party.id = r.to_party_id
  join relationship_types rt on rt.id = r.relationship_type_id`;
}

function entityParticipantJoinSql(): string {
  return `select
    ep.*,
    p.type as party_type,
    p.display_name as party_display_name,
    p.created_at as party_created_at,
    p.updated_at as party_updated_at,
    prt.key as role_key,
    prt.label as role_label_joined,
    prt.applies_to_entity_type as role_applies_to_entity_type,
    prt.is_system as role_is_system,
    prt.sort_order as role_sort_order,
    prt.created_at as role_created_at,
    prt.updated_at as role_updated_at
  from entity_participants ep
  join parties p on p.id = ep.party_id
  left join participant_role_types prt on prt.id = ep.role_type_id`;
}

function personDisplayName(input: Pick<CreatePersonInput, "firstName" | "lastName">): string {
  const parts = [clean(input.firstName), clean(input.lastName)].filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Person firstName or lastName is required");
  }
  return parts.join(" ");
}

function normalizeRelationshipParties(type: RelationshipType, fromPartyId: number, toPartyId: number): { fromPartyId: number; toPartyId: number } {
  if (type.directionality === "symmetric" && fromPartyId > toPartyId) {
    return { fromPartyId: toPartyId, toPartyId: fromPartyId };
  }
  return { fromPartyId, toPartyId };
}

function ensurePartyExists(db: Database.Database, partyId: number): void {
  const row = db.prepare("select id from parties where id = ?").get(partyId) as { id: number } | undefined;
  if (!row) {
    throw new Error(`Party not found: ${partyId}`);
  }
}

function ensureParticipantEntityExists(db: Database.Database, entityType: ParticipantEntityType, entityId: number): void {
  const tableByEntityType: Record<ParticipantEntityType, string> = {
    initiative: "initiatives",
    task: "tasks",
    calendar_entry: "calendar_entries"
  };
  const table = tableByEntityType[entityType];
  const row = db.prepare(`select id from ${table} where id = ?`).get(entityId) as { id: number } | undefined;
  if (!row) {
    throw new Error(`${entityType} not found: ${entityId}`);
  }
}

function normalizeContactPointValue(type: ContactPointType, value: string): string {
  const trimmed = value.trim();
  if (type === "email") {
    return trimmed.toLowerCase();
  }
  if (type === "phone" || type === "whatsapp" || type === "signal") {
    return trimmed.replace(/[\s().-]/g, "");
  }
  return trimmed;
}

function cleanupStaleGmailLinksForContactPoint(db: Database.Database, contactPointId: number): void {
  db
    .prepare(
      `delete from gmail_message_party_links
       where contact_point_id = ?
         and not exists (
           select 1
           from party_contact_points cp
           where cp.id = gmail_message_party_links.contact_point_id
             and cp.type = 'email'
             and lower(cp.normalized_value) = lower(gmail_message_party_links.matched_email)
         )`
    )
    .run(contactPointId);
}

function deleteGmailLinksForContactPoint(db: Database.Database, contactPointId: number): void {
  db.prepare("delete from gmail_message_party_links where contact_point_id = ?").run(contactPointId);
}

function assertValidDateRange(start: string | null, end: string | null, message: string): void {
  if (start && end && start > end) {
    throw new Error(message);
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nextSortOrder(db: Database.Database, table: string): number {
  const row = db.prepare(`select coalesce(max(sort_order), 0) + 1000 as next from ${table}`).get() as { next: number };
  return row.next;
}
