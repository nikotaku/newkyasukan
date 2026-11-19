// Keep room assignment alongside the existing optional equipment properties.
const ROOM_KEY = "__room_id";

export function equipmentRoomId(item: { custom_fields: Record<string, string> | null }): string | null {
  return item.custom_fields?.[ROOM_KEY] || null;
}

export function equipmentProperties(fields: Record<string, string> | null): Record<string, string> {
  return Object.fromEntries(Object.entries(fields || {}).filter(([key]) => key !== ROOM_KEY));
}

export function equipmentFields(fields: { key: string; value: string }[], roomId: string): Record<string, string> {
  const result = Object.fromEntries(fields.filter(field => field.key.trim() && field.key.trim() !== ROOM_KEY).map(field => [field.key.trim(), field.value]));
  return roomId ? { ...result, [ROOM_KEY]: roomId } : result;
}
