export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "phone"
  | "url"
  | "email"
  | "checkbox";

export interface SelectOption {
  label: string;
  color: string;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
  width?: number;
  hidden?: boolean;
}

export interface DatabaseRecord {
  id: string;
  [key: string]: any;
}
