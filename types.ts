
export interface PagedResponse<T> {
  data: T[];
  links: {
    first?: string;
    last?: string;
    next?: string;
    prev?: string;
  };
  pagination: {
    currentPage: number;
    elementsPerPage: number;
    totalElements: number;
    totalPages: number;
  };
}

export interface OparlObject {
  id: string;
  type: string;
  name?: string;
  created: string;
  modified: string;
  deleted?: boolean;
  web?: string;
}

export interface Body extends OparlObject {
  system: string;
  contactEmail?: string;
  contactName?: string;
  organization: string[];
  person: string[];
  meeting: string[];
  paper: string[];
  legislativeTerm: LegislativeTerm[];
  location?: Location;
}

export interface LegislativeTerm extends OparlObject {
  startDate?: string;
  endDate?: string;
  body: string;
}

export interface Organization extends OparlObject {
  body: string;
  organizationType?: string;
  name: string;
  shortName?: string;
  membership: string[];
  meeting?: string;
  consultation?: string[];
  subOrganizationOf?: string;
  classification?: string;
}

export interface Person extends OparlObject {
  body: string;
  familyName: string;
  givenName: string;
  formOfAddress?: string;
  title?: string;
  membership: string[];
  location?: Location;
  email?: string[];
  phone?: string[];
}

export interface Membership extends OparlObject {
    person: string;
    organization: string;
    role?: string;
    votingRight?: boolean;
    startDate?: string;
    endDate?: string;
}

export interface Meeting extends OparlObject {
  name: string;
  start: string;
  end?: string;
  location?: string | Location;
  organization: string[];
  participant: string[];
  invitation?: string;
  resultsProtocol?: string;
  verbatimProtocol?: string;
  auxiliaryFile?: string[];
  agendaItem: AgendaItem[];
}

export interface AgendaItem extends OparlObject {
    key?: string;
    name: string;
    number: string;
    public?: boolean;
    consultation?: string | Consultation;
    resolutionText?: string;
    resolutionFile?: string;
    auxiliaryFile?: File[];
    start?: string;
    end?: string;
    result?: string;
}

export interface Paper extends OparlObject {
  body: string;
  name: string;
  reference: string;
  date?: string;
  paperType?: string;
  relatedPaper?: string[];
  mainFile?: File;
  auxiliaryFile?: File[];
  location?: Location[];
  consultation: Consultation[];
  underDirectionOf?: string[];
  originator?: string[];
}

export interface Consultation extends OparlObject {
    paper: string | Paper;
    agendaItem?: string;
    meeting?: string;
    organization: string[];
    authoritative?: boolean;
    role?: string;
}

export interface File extends OparlObject {
  name: string;
  fileName?: string;
  mimeType: string;
  date?: string;
  size?: number;
  sha1Checksum?: string;
  accessUrl: string;
  downloadUrl?: string;
  text?: string;
}

export interface Location extends OparlObject {
    description?: string;
    streetAddress?: string;
    room?: string;
    postalCode?: string;
    locality?: string;
    geojson?: object;
}