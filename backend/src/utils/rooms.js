/** "2 Premium, 1 Club" — the room categories on a room block, or '' when it has none. */
export function roomTypesLine(room) {
  return (room?.types || [])
    .filter((t) => Number(t?.count) > 0)
    .map((t) => `${t.count} ${t.name}`)
    .join(', ');
}

export default { roomTypesLine };
