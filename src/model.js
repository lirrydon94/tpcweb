// Civil dates use UTC internally so rotations do not change at daylight-saving boundaries.
const DAY = 86_400_000;
const ABSENCE_TYPES = new Set(['vacation', 'sick', 'pension', 'custom', 'off', 'leave']);
export const PERSONAL_ABSENCE_TYPES = ['off', 'leave', 'vacation', 'sick', 'pension'];

export function uid() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function civilDate(value) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new RangeError('Ange ett datum i formatet ÅÅÅÅ-MM-DD.');
  const timestamp = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== text) {
    throw new RangeError('Välj ett giltigt datum.');
  }
  return new Date(timestamp);
}

const dateString = date => date.toISOString().slice(0, 10);
const dayNumber = value => civilDate(value).getTime() / DAY;
const mod = (number, divisor) => ((number % divisor) + divisor) % divisor;
const clone = value => JSON.parse(JSON.stringify(value));

export function addDays(date, count) {
  const result = civilDate(date);
  result.setUTCDate(result.getUTCDate() + Number(count));
  return dateString(result);
}

export function mondayOf(date) {
  const value = civilDate(date);
  return addDays(value, -mod(value.getUTCDay() - 1, 7));
}

export function weekDates(date) {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function isoWeek(date) {
  const thursday = civilDate(addDays(mondayOf(date), 3));
  const year = thursday.getUTCFullYear();
  const firstMonday = mondayOf(`${year}-01-04`);
  return { week: Math.floor((dayNumber(thursday) - dayNumber(firstMonday)) / 7) + 1, year };
}

export function minutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function duration(start, end) {
  const from = minutes(start);
  const until = minutes(end);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from === until) return 0;
  return mod(until - from, 1440);
}

function interval(assignment) {
  const start = dayNumber(assignment.date) * 1440 + minutes(assignment.start);
  return [start, start + duration(assignment.start, assignment.end)];
}

function overlap(a, b) {
  const [aStart, aEnd] = interval(a);
  const [bStart, bEnd] = interval(b);
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

const clockTime = total => `${String(Math.floor(mod(total, 1440) / 60)).padStart(2, '0')}:${String(mod(total, 60)).padStart(2, '0')}`;

function isActive(member, date) {
  return Boolean(member && (!member.activeFrom || member.activeFrom <= date) && (!member.activeUntil || date < member.activeUntil));
}

function findMember(state, memberId, date) {
  const hourly=state.employees?.find(e=>e.id===memberId&&e.role==='part-time'&&isActive(e,date));
  if(hourly)return {member:hourly,team:null};
  for (const team of state.teams || []) {
    const member = team.members.find(item => item.id === memberId && isActive(item, date) && belongsToGroup(state, memberId, team.id, date));
    if (member) return { member, team };
  }
  return null;
}

export function activeVersion(team, date) {
  const target = dateString(civilDate(date));
  return [...(team?.versions || [])]
    .filter(version => version.effectiveFrom <= target)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
}

export function rotationPosition(version, memberId, date) {
  const length = version?.rotation?.length;
  const startPosition = Number(version?.positions?.[memberId]);
  if (!length || !Number.isInteger(startPosition) || startPosition < 1 || startPosition > length) return 0;
  const weeksPassed = Math.floor((dayNumber(mondayOf(date)) - dayNumber(mondayOf(version.referenceMonday))) / 7);
  return mod(startPosition - 1 + weeksPassed, length) + 1;
}

export function personalScheduleOn(version, memberId, date) {
  return [...(version?.personalSchedules || [])]
    .filter(item => item.memberId === memberId && item.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
}

// Keep personal days attached to their group rotation week when rows move.
export function remapPersonalSchedules(version, indices) {
  for (const schedule of version.personalSchedules || []) {
    schedule.rotation = indices.map(index => clone(schedule.rotation[index] || Array(7).fill(null)));
  }
}

export function savePersonalSchedule(state, teamId, versionId, schedule, { previousEffectiveFrom } = {}) {
  const team = state.teams.find(item => item.id === teamId);
  const version = team?.versions.find(item => item.id === versionId);
  const date = dateString(civilDate(schedule.effectiveFrom));
  if (!version || activeVersion(team, date)?.id !== versionId
    || !isActive(team.members.find(item => item.id === schedule.memberId), date)
    || !belongsToGroup(state, schedule.memberId, teamId, date)) {
    throw new Error('Välj ett startdatum då personen tillhör den här gruppen och schemaversionen gäller.');
  }
  const errors = validatePersonalSchedules(team, version, [schedule]);
  if (errors.length) throw new Error(errors[0]);
  if (previousEffectiveFrom && previousEffectiveFrom !== date && version.personalSchedules?.some(item =>
    item.memberId === schedule.memberId && item.effectiveFrom === date)) {
    throw new Error('Det finns redan ett personligt schema med det startdatumet. Öppna det sparade schemat för att redigera det.');
  }
  version.personalSchedules = [...(version.personalSchedules || []).filter(item =>
    item.memberId !== schedule.memberId || (item.effectiveFrom !== date && item.effectiveFrom !== previousEffectiveFrom)), clone(schedule)];
}

function validatePersonalSchedules(team, version, schedules = version.personalSchedules) {
  if (schedules === undefined) return [];
  if (!Array.isArray(schedules)) return ['Personliga scheman måste vara en lista.'];
  const errors = [], keys = new Set();
  for (const schedule of schedules) {
    if (!schedule || !team.members.some(member => member.id === schedule.memberId)) {
      errors.push('Det personliga schemats medarbetare saknas.'); continue;
    }
    try { civilDate(schedule.effectiveFrom); } catch { errors.push('Välj ett giltigt startdatum för det personliga schemat.'); }
    const key = `${schedule.memberId}:${schedule.effectiveFrom}`;
    if (keys.has(key)) errors.push('Endast ett personligt schema per medarbetare och startdatum tillåts.');
    keys.add(key);
    if (typeof schedule.employmentPercent !== 'number' || !Number.isFinite(schedule.employmentPercent)
      || schedule.employmentPercent <= 0 || schedule.employmentPercent > 100) errors.push('Anställningsgraden måste vara större än 0 och högst 100 %.');
    if (!Array.isArray(schedule.rotation) || schedule.rotation.length !== version.rotation.length) {
      errors.push('Det personliga schemat måste följa gruppens antal rotationsveckor.'); continue;
    }
    for (const row of schedule.rotation) {
      if (!Array.isArray(row) || row.length !== 7) { errors.push('Varje personlig schemavecka måste ha sju dagar.'); continue; }
      for (const cell of row) {
        if (cell === null) continue;
        if (!cell || ![...PERSONAL_ABSENCE_TYPES, 'custom', 'shift'].includes(cell.type)
          || (cell.type === 'shift' && !Object.hasOwn(version.shifts, cell.code))
          || (cell.type === 'custom' && !duration(cell.start, cell.end))) errors.push('Välj en giltig passkod, frånvaro eller giltiga, olika start- och sluttider för personliga pass.');
      }
    }
  }
  return errors;
}

function baseShift(state, teamId, memberId, date) {
  const empty = { memberId, teamId, date, code: '', start: null, end: null, type: 'off', working: false, minutes: 0, rotationWeek: 0 };
  const team = state.teams?.find(item => item.id === teamId);
  const member = team?.members.find(item => item.id === memberId);
  if (!isActive(member, date) || !belongsToGroup(state, memberId, teamId, date)) return empty;
  const version = activeVersion(team, date);
  const rotationWeek = rotationPosition(version, memberId, date);
  if (!rotationWeek) return empty;
  const weekday = mod(civilDate(date).getUTCDay() - 1, 7);
  const code = version.rotation[rotationWeek - 1]?.[weekday] || '';
  const shift = version.shifts[code];
  const personal = personalScheduleOn(version, memberId, date)?.rotation[rotationWeek - 1]?.[weekday];
  if (personal) {
    if (PERSONAL_ABSENCE_TYPES.includes(personal.type)) return { ...empty, code, type: personal.type, rotationWeek, personalSchedule: true };
    const selected = personal.type === 'shift' ? version.shifts[personal.code] : personal;
    if (!selected) return { ...empty, rotationWeek };
    return { ...empty, code: personal.type === 'shift' ? personal.code : code, start: selected.start, end: selected.end, color: selected.color || shift?.color || 'mint',
      type: 'shift', working: true, minutes: duration(selected.start, selected.end), rotationWeek, personalSchedule: true };
  }
  if (!shift) return { ...empty, rotationWeek };
  return { ...empty, code, start: shift.start, end: shift.end, color: shift.color, type: 'shift', working: true, minutes: duration(shift.start, shift.end), rotationWeek };
}

function currentExceptions(state, date) {
  // A later exception supersedes an earlier one for the same person/date.
  const map = new Map();
  for (const item of state.exceptions || []) {
    if (item?.date === date) map.set(`${item.teamId}:${item.memberId}`, item);
  }
  return [...map.values()];
}

function replacementAvailable(state, memberId, date) {
  if (!findMember(state, memberId, date)) return false;
  return !unavailableForCover(state, memberId, date);
}

function unavailableForCover(state, memberId, date) {
  const exceptions = currentExceptions(state, date).filter(exception => exception.memberId === memberId);
  if (exceptions.length) return exceptions.some(exception =>
    (['vacation', 'sick', 'off', 'leave'].includes(exception.type)
      || (exception.type === 'pension' && !duration(exception.start, exception.end))));
  const person = findMember(state, memberId, date);
  return Boolean(person?.team && ['vacation', 'sick', 'leave', 'pension'].includes(baseShift(state, person.team.id, memberId, date).type));
}

function adjustedShift(state, teamId, memberId, date) {
  const base = baseShift(state, teamId, memberId, date);
  const member = state.teams?.find(team => team.id === teamId)?.members.find(item => item.id === memberId);
  if (!isActive(member, date) || !belongsToGroup(state, memberId, teamId, date)) return base;
  const exception = currentExceptions(state, date).find(item => item.teamId === teamId && item.memberId === memberId);
  if (!exception) return base;
  const works = ['custom', 'pension'].includes(exception.type) && duration(exception.start, exception.end) > 0;
  const result = {
    ...base,
    type: exception.type,
    working: works,
    start: works ? exception.start : null,
    end: works ? exception.end : null,
    minutes: works ? duration(exception.start, exception.end) : 0,
    originalStart: base.start,
    originalEnd: base.end,
    note: exception.note || '',
    exceptionId: exception.id,
    replacementId: exception.replacementId || null,
  };
  if (base.working) {
    const occupied = [];
    const original = interval(base);
    if (result.working) occupied.push(interval(result));
    if (exception.replacementId && exception.replacementId !== memberId && replacementAvailable(state, exception.replacementId, date)) {
      const coverStart = exception.replacementStart || base.start;
      const coverEnd = exception.replacementEnd || base.end;
      if (duration(coverStart, coverEnd)) occupied.push(interval({ date, start: coverStart, end: coverEnd }));
    }
    const clipped = occupied.map(([start, end]) => [Math.max(start, original[0]), Math.min(end, original[1])])
      .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let lastEnd = original[0];
    for (const [start, end] of clipped) {
      covered += Math.max(0, end - Math.max(start, lastEnd));
      lastEnd = Math.max(lastEnd, end);
    }
    result.uncoveredMinutes = Math.max(0, base.minutes - covered);
    result.needsCoverage = result.uncoveredMinutes > 0;
  }
  return result;
}

function coversOnDate(state, date) {
  const covers = [];
  for (const exception of currentExceptions(state, date)) {
    if (!exception.replacementId || exception.replacementId === exception.memberId
      || !replacementAvailable(state, exception.replacementId, date)) continue;
    const base = baseShift(state, exception.teamId, exception.memberId, date);
    if (!findMember(state, exception.memberId, date) || !belongsToGroup(state, exception.memberId, exception.teamId, date)) continue;
    const start = exception.replacementStart || base.start;
    const end = exception.replacementEnd || base.end;
    if (!duration(start, end)) continue;
    covers.push({
      memberId: exception.replacementId,
      teamId: exception.teamId,
      date,
      code: base.code,
      start,
      end,
      type: 'cover',
      working: true,
      minutes: duration(start, end),
      rotationWeek: base.rotationWeek,
      sourceMemberId: exception.memberId,
      exceptionId: exception.id,
      color: base.color || 'blue',
    });
  }
  return covers;
}

function rawAssignments(state, date) {
  const scheduled = (state.teams || []).flatMap(team => team.members
    .map(member => adjustedShift(state, team.id, member.id, date)).filter(shift => shift.working));
  return [...scheduled, ...coversOnDate(state, date)];
}

function assignmentsWithConflicts(state, date) {
  const records = rawAssignments(state, date);
  const adjacent = [...rawAssignments(state, addDays(date, -1)), ...records, ...rawAssignments(state, addDays(date, 1))];
  return records.map(record => ({
    ...record,
    conflict: adjacent.some(other => other !== record && other.memberId === record.memberId && overlap(record, other) > 0),
  }));
}

export function getShift(state, teamId, memberId, date, { draft = false } = {}) {
  void draft; // The caller selects either its saved draft or published snapshot.
  const targetDate = dateString(civilDate(date));
  const own = adjustedShift(state, teamId, memberId, targetDate);
  const assignments = assignmentsWithConflicts(state, targetDate).filter(record => record.memberId === memberId);
  const covers = assignments.filter(record => record.type === 'cover');
  if (!own.working && covers.length) return { ...covers[0], covers, underlyingType: own.type };
  return { ...own, covers, conflict: assignments.some(record => record.conflict) };
}

export function getDayAssignments(state, teamId, date) {
  const targetDate = dateString(civilDate(date));
  return assignmentsWithConflicts(state, targetDate).filter(record => record.teamId === teamId);
}

export function getCoworkers(state, teamId, memberId, date) {
  const targetDate = dateString(civilDate(date));
  const records = [addDays(targetDate, -1), targetDate, addDays(targetDate, 1)]
    .flatMap(day => assignmentsWithConflicts(state, day));
  const mine = records.filter(record => record.date === targetDate && record.memberId === memberId && (record.teamId === teamId || record.type === 'cover'));
  const coworkers = [];
  const seen = new Set();
  for (const own of mine) {
    for (const other of records) {
      if (other.memberId === memberId || other.teamId !== own.teamId || !overlap(own, other)) continue;
      const [ownStart, ownEnd] = interval(own);
      const [otherStart, otherEnd] = interval(other);
      const start = Math.max(ownStart, otherStart);
      const end = Math.min(ownEnd, otherEnd);
      const key = `${other.memberId}:${other.date}:${other.start}:${other.end}:${other.exceptionId || ''}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coworkers.push({
        ...other,
        name: findMember(state, other.memberId, other.date)?.member.name || 'Medarbetare',
        overlapStart: clockTime(start),
        overlapEnd: clockTime(end),
        overlapMinutes: end - start,
      });
    }
  }
  return coworkers.sort((a, b) => a.overlapStart.localeCompare(b.overlapStart) || a.name.localeCompare(b.name));
}

export function weekStats(state, teamId, memberId, date) {
  const dates = weekDates(date);
  const assignments = dates.flatMap(day => assignmentsWithConflicts(state, day))
    .filter(record => record.memberId === memberId && (record.teamId === teamId || record.type === 'cover'));
  const workingDays = new Set(assignments.map(record => record.date));
  const totalMinutes = assignments.reduce((sum, record) => sum + record.minutes, 0);
  return {
    shifts: assignments.length,
    hours: totalMinutes / 60,
    minutes: totalMinutes,
    daysOff: 7 - workingDays.size,
    covers: assignments.filter(record => record.type === 'cover').length,
    rotationWeek: getShift(state, teamId, memberId, dates[0]).rotationWeek,
  };
}

export function createVersion(team, effectiveFrom, length) {
  const date = dateString(civilDate(effectiveFrom));
  const count = Number(length);
  if (!Number.isInteger(count) || count < 1 || count > 104) throw new RangeError('Ett schema måste innehålla mellan 1 och 104 veckor.');
  const base = activeVersion(team, date) || [...(team.versions || [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const referenceMonday = mondayOf(date);
  return {
    id: uid(),
    effectiveFrom: date,
    referenceMonday,
    rotation: Array.from({ length: count }, (_, index) => [...(base?.rotation[index] || Array(7).fill(''))]),
    positions: Object.fromEntries(team.members.flatMap((member, index) => {
      // Relief workers without a normal rotation stay available for individual covers.
      if (member.role === 'part-time' && (!base || !base.positions?.[member.id])) return [];
      const position = base ? rotationPosition(base, member.id, referenceMonday) : index + 1;
      return [[member.id, mod(Math.max(1, position) - 1, count) + 1]];
    })),
    shifts: clone(base?.shifts || {}),
    ...(base?.personalSchedules ? { personalSchedules: base.personalSchedules.map(schedule => ({
      ...clone(schedule), rotation: Array.from({ length: count }, (_, index) => clone(schedule.rotation[index] || Array(7).fill(null))),
    })) } : {}),
  };
}

export function archiveMember(team, memberId, date) {
  const member = team.members.find(item => item.id === memberId);
  if (!member) throw new Error('Medarbetaren kunde inte hittas.');
  const effectiveDate = dateString(civilDate(date));
  if (member.activeFrom && effectiveDate < member.activeFrom) throw new Error('Medarbetaren kan inte tas bort före sitt startdatum.');
  member.activeUntil = effectiveDate;
  return member;
}

export function deleteTeam(state, teamId) {
  const team = state.teams.find(item => item.id === teamId);
  if (!team) throw new Error('Teamet kunde inte hittas.');
  const removedMembers = new Set(state.employees ? [] : team.members.map(member => member.id));
  const next = clone(state);
  next.teams = next.teams.filter(item => item.id !== teamId);
  for (const employee of next.employees || []) for (const placement of employee.placements) if (placement.groupId === teamId) placement.groupId = null;
  next.exceptions = next.exceptions.filter(item => item.teamId !== teamId);
  for (const exception of next.exceptions) {
    if (removedMembers.has(exception.replacementId)) {
      delete exception.replacementId;
      delete exception.replacementStart;
      delete exception.replacementEnd;
    }
  }
  return next;
}

export function validateState(state) {
  const errors = [];
  const checkDate = (date, label) => {
    try { civilDate(date); return true; }
    catch { errors.push(`${label}: välj ett giltigt datum.`); return false; }
  };
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.teams) || !Array.isArray(state.exceptions)) {
    return ['Schemafilens format stöds inte.'];
  }
  if (state.departments) {
    for (const key of ['departments', 'workTeams', 'employees']) {
      if (!Array.isArray(state[key])) return ['Organisationens format stöds inte.'];
      const ids = new Set();
      for (const item of state[key]) {
        if (!item?.id || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return ['Organisationens poster behöver unika ID och namn.'];
        ids.add(item.id);
      }
    }
    for (const team of state.workTeams) if (!state.departments.some(d => d.id === team.departmentId)) errors.push('Teamets avdelning saknas.');
    for (const group of state.teams) {
      if (!group || !state.workTeams.some(t => t.id === group.workTeamId)) { errors.push('Gruppens team saknas.'); continue; }
      const ids = new Set();
      for (const member of group.members || []) {
        if (!member || ids.has(member.id) || !state.employees.some(e => e.id === member.id)) errors.push('Gruppens medarbetare måste finnas i avdelningens personallista.');
        ids.add(member?.id);
      }
    }
    for (const e of state.employees) {
      if (!state.departments.some(d => d.id === e.departmentId) || !Array.isArray(e.placements)) return ['Medarbetarens avdelning eller placering saknas.'];
      if (!['member', 'part-time'].includes(e.role)) errors.push('Välj en giltig anställningstyp.');
      if (e.skilledTeamIds !== undefined && (!Array.isArray(e.skilledTeamIds)
        || new Set(e.skilledTeamIds).size !== e.skilledTeamIds.length
        || e.skilledTeamIds.some(id => typeof id !== 'string' || !state.workTeams.some(t => t.id === id && t.departmentId === e.departmentId)))) {
        errors.push(`${e.name}: välj kunskaper bland avdelningens team.`);
      }
      if (e.activeFrom) checkDate(e.activeFrom, e.name);
      const dates = new Set();
      for (const p of e.placements) {
        checkDate(p.from, e.name);
        if (dates.has(p.from)) errors.push('Endast en placering per startdatum tillåts.');
        dates.add(p.from);
        const team = state.workTeams.find(t => t.id === p.teamId);
        const group = state.teams.find(g => g.id === p.groupId);
        if ((p.teamId && team?.departmentId !== e.departmentId) || (p.groupId && (!group || group.workTeamId !== p.teamId || !Array.isArray(group.members) || !group.members.some(m => m.id === e.id)))) errors.push('Medarbetarens placering är ogiltig.');
      }
    }
  }
  const teamIds = new Set();
  const memberIds = new Set();
  const allMembers = new Map((state.employees||[]).map(e=>[e.id,e]));
  for (const team of state.teams) {
    if (!team || typeof team !== 'object' || Array.isArray(team)) {
      errors.push('Ett team har ett format som inte stöds.');
      continue;
    }
    if (!team.id || teamIds.has(team.id)) errors.push('Varje team behöver ett unikt ID.');
    teamIds.add(team.id);
    if (typeof team.name !== 'string' || !team.name.trim()) errors.push('Varje team behöver ett namn.');
    if (!Array.isArray(team.members) || !Array.isArray(team.versions)) {
      errors.push(`${team.name || 'Team'}: medarbetare och scheman saknas.`);
      continue;
    }
    for (const member of team.members) {
      if (!member || typeof member !== 'object' || Array.isArray(member)) {
        errors.push(`${team.name || 'Team'}: en medarbetare har ett format som inte stöds.`);
        continue;
      }
      if (!member.id || (memberIds.has(member.id) && !state.employees?.some(e => e.id === member.id))) errors.push('Varje medarbetare behöver ett unikt ID.');
      memberIds.add(member.id);
      allMembers.set(member.id, member);
      if (typeof member.name !== 'string' || !member.name.trim()) errors.push(`${team.name}: en medarbetare behöver ett namn.`);
      if (!['member', 'part-time'].includes(member.role)) errors.push(`${member.name}: välj en giltig roll.`);
      if (member.activeFrom) checkDate(member.activeFrom, `${member.name}, startdatum`);
      if (member.activeUntil) {
        checkDate(member.activeUntil, `${member.name}, avslutsdatum`);
        if (member.activeFrom && member.activeUntil < member.activeFrom) errors.push(`${member.name}: avslutsdatumet ligger före startdatumet.`);
      }
    }
    if (!team.versions.length) errors.push(`${team.name}: lägg till ett schema.`);
    const effectiveDates = new Set();
    const versionIds = new Set();
    for (const version of team.versions) {
      const label = `${team.name}, schema`;
      if (!version || typeof version !== 'object' || Array.isArray(version)) {
        errors.push(`${label}: en post har ett format som inte stöds.`);
        continue;
      }
      if (!version.id || versionIds.has(version.id)) errors.push(`${label}: varje version behöver ett unikt ID.`);
      versionIds.add(version.id);
      checkDate(version.effectiveFrom, `${label}, giltigt från`);
      if (effectiveDates.has(version.effectiveFrom)) errors.push(`${label}: två versioner börjar samma datum.`);
      effectiveDates.add(version.effectiveFrom);
      if (checkDate(version.referenceMonday, `${label}, referensmåndag`) && mondayOf(version.referenceMonday) !== version.referenceMonday) {
        errors.push(`${label}: referensdatumet måste vara en måndag.`);
      }
      if (!Array.isArray(version.rotation) || !version.rotation.length || version.rotation.length > 104) {
        errors.push(`${label}: välj mellan 1 och 104 veckor.`);
        continue;
      }
      if (!version.shifts || typeof version.shifts !== 'object' || Array.isArray(version.shifts)) {
        errors.push(`${label}: ange passkoder och arbetstider.`);
        continue;
      }
      for (const [code, shift] of Object.entries(version.shifts)) {
        if (!code.trim() || !shift || !duration(shift.start, shift.end)) errors.push(`${label}: pass ${code || '(utan kod)'} måste ha giltiga och olika start- och sluttider.`);
      }
      for (const [index, row] of version.rotation.entries()) {
        if (!Array.isArray(row) || row.length !== 7) {
          errors.push(`${label}: schemavecka ${index + 1} måste ha sju dagar.`);
          continue;
        }
        for (const code of row) {
          if (typeof code !== 'string' || (code && !Object.hasOwn(version.shifts, code))) {
            errors.push(`${label}: schemavecka ${index + 1} hänvisar till en okänd passkod.`);
          }
        }
      }
      for (const member of team.members) {
        if (!member || typeof member !== 'object') continue;
        if (member.role === 'part-time' && version.positions?.[member.id] == null) continue;
        const nextEffectiveDate = team.versions.filter(item => item?.effectiveFrom > version.effectiveFrom)
          .map(item => item.effectiveFrom).sort()[0];
        // A historical version need not include someone who was never active during it.
        if (member.activeUntil && member.activeUntil <= version.effectiveFrom) continue;
        if (nextEffectiveDate && member.activeFrom && member.activeFrom >= nextEffectiveDate) continue;
        const position = Number(version.positions?.[member.id]);
        if (!Number.isInteger(position) || position < 1 || position > version.rotation.length) {
          errors.push(`${label}: välj en startvecka för ${member.name}.`);
        }
      }
      errors.push(...validatePersonalSchedules(team, version));
    }
  }
  const exceptionIds = new Set();
  const exceptionKeys = new Set();
  for (const exception of state.exceptions) {
    if (!exception || typeof exception !== 'object' || Array.isArray(exception)) {
      errors.push('En schemaändring har ett format som inte stöds.');
      continue;
    }
    if (!exception.id || exceptionIds.has(exception.id)) errors.push('Varje schemaändring behöver ett unikt ID.');
    exceptionIds.add(exception.id);
    const team = state.teams.find(item => item?.id === exception.teamId);
    const member = Array.isArray(team?.members) ? team.members.find(item => item?.id === exception.memberId) : null;
    if (!member) errors.push('En schemaändring hänvisar till en medarbetare eller ett team som saknas.');
    checkDate(exception.date, ['vacation', 'sick', 'pension', 'off', 'leave'].includes(exception.type) ? 'Frånvarodatum' : 'Datum för schemaändring');
    const key = `${exception.teamId}:${exception.memberId}:${exception.date}`;
    if (exceptionKeys.has(key)) errors.push('Ange endast en schemaändring per medarbetare och datum.');
    exceptionKeys.add(key);
    if (!ABSENCE_TYPES.has(exception.type)) errors.push('Välj en giltig typ av schemaändring.');
    if (exception.type === 'custom' || exception.start || exception.end) {
      if (!duration(exception.start, exception.end)) errors.push('Ändrade pass måste ha giltiga och olika start- och sluttider.');
    }
    if (exception.replacementId) {
      if (!allMembers.has(exception.replacementId)) errors.push('Ersättaren kunde inte hittas.');
      if (exception.replacementId === exception.memberId) errors.push('En medarbetare kan inte ersätta sig själv.');
      const replacement = allMembers.get(exception.replacementId);
      if (replacement && !isActive(replacement, exception.date)) {
        errors.push(`${replacement.name}: ersättningsdatumet ligger utanför medarbetarens aktiva period.`);
      } else if (replacement && !errors.length && unavailableForCover(state, replacement.id, exception.date)) {
        errors.push(`${replacement.name}: kan inte arbeta som ersättare den ${exception.date} på grund av frånvaro.`);
      }
      if ((exception.replacementStart || exception.replacementEnd) && !duration(exception.replacementStart, exception.replacementEnd)) {
        errors.push('Ersättningspass måste ha giltiga och olika start- och sluttider.');
      }
    }
  }
  // Each regular rotation produces one shift per person. Covers can introduce a
  // second assignment, so inspect only their dates, including overnight overlap.
  if (!errors.length) {
    const replacementDates = [...new Set(state.exceptions.filter(item => item.replacementId).map(item => item.date))];
    const reported = new Set();
    for (const date of replacementDates) {
      for (const assignment of assignmentsWithConflicts(state, date)) {
        if (!assignment.conflict || reported.has(`${assignment.memberId}:${date}`)) continue;
        reported.add(`${assignment.memberId}:${date}`);
        const name = allMembers.get(assignment.memberId)?.name || 'En medarbetare';
        errors.push(`${name}: överlappande pass den ${date}. Ändra ersättarens arbetstider eller välj en annan medarbetare före publicering.`);
      }
    }
  }
  return errors;
}

export function publishState(state) {
  const errors = validateState(state);
  if (errors.length) throw new Error(errors.join('\n'));
  return { ...clone(state), publishedAt: new Date().toISOString() };
}

export function seedState(referenceDate = '2026-10-12') {
  const referenceMonday = mondayOf(referenceDate);
  const effectiveFrom = mondayOf(`${referenceMonday.slice(0, 4)}-01-07`);
  const names = ['Du', 'Anna', 'Erik', 'Sara', 'Johan', 'Maria', 'David'];
  const members = names.map((name, index) => ({ id: `member-${index + 1}`, name, role: 'member', activeFrom: effectiveFrom, activeUntil: null }));
  const shifts = {
    A: { start: '07:00', end: '16:00', color: 'amber' },
    C: { start: '11:30', end: '20:30', color: 'purple' },
    B: { start: '09:30', end: '18:30', color: 'blue' },
    B2: { start: '08:30', end: '17:30', color: 'blue' },
    F: { start: '08:00', end: '17:00', color: 'teal' },
    A2: { start: '06:15', end: '15:15', color: 'amber' },
    A3: { start: '06:15', end: '15:15', color: 'amber' },
  };
  return {
    schemaVersion: 1,
    teams: [{
      id: 'team-1', name: 'Team 1', color: '#356e58', members,
      versions: [{
        id: 'rotation-1', effectiveFrom, referenceMonday, shifts,
        positions: Object.fromEntries(members.map((member, index) => [member.id, index + 1])),
        rotation: [
          ['C', 'B', 'F', 'A', 'A2', '', ''],
          ['', 'C', 'B', 'A2', '', 'C', 'C'],
          ['F', '', '', 'C', 'B', '', ''],
          ['A', 'A2', 'A', '', 'C', 'B2', 'A3'],
          ['', 'A', 'C', 'B', 'A', '', ''],
          ['C', 'B', 'A2', 'F', '', '', ''],
          ['A2', 'A', 'A', '', 'B', 'A3', 'C'],
          ['B', '', '', 'C', 'F', '', ''],
          ['A', 'C', 'B', 'A', 'A', '', ''],
          ['B', 'A', '', '', 'C', 'C', 'B2'],
          ['', 'F', 'C', 'B', 'A', '', ''],
        ],
      }],
    }],
    exceptions: [],
    publishedAt: null,
  };
}
// The legacy `teams` field stores schedule groups for backup compatibility.
export function organizeState(state) {
  if (state.departments) return state;
  const departmentId = 'department-default';
  state.departments = [{ id: departmentId, name: 'Min avdelning' }];
  state.workTeams = state.teams.map(group => ({ id: `work-${group.id}`, departmentId, name: group.name }));
  state.employees = state.teams.flatMap(group => group.members.map(member => ({ ...structuredClone(member), departmentId, placements: [{ from: member.activeFrom || '1900-01-01', teamId: `work-${group.id}`, groupId: group.id }] })));
  for (const group of state.teams) { group.workTeamId = `work-${group.id}`; }
  return state;
}

export function placementOn(employee, date) {
  return [...(employee?.placements || [])].filter(p => p.from <= date).sort((a,b) => b.from.localeCompare(a.from))[0] || null;
}

export function belongsToGroup(state, memberId, groupId, date) {
  if (!state.employees) return true;
  return placementOn(state.employees.find(e => e.id === memberId), date)?.groupId === groupId;
}

export function placeEmployee(state, employeeId, teamId, groupId, date) {
  civilDate(date);
  const employee = state.employees.find(e => e.id === employeeId);
  const team = state.workTeams.find(t => t.id === teamId);
  const group = state.teams.find(g => g.id === groupId);
  if (!employee || (teamId && team?.departmentId !== employee.departmentId) || (groupId && (!group || group.workTeamId !== teamId))) throw new Error('Välj ett team och en grupp inom avdelningen.');
  if (employee.activeFrom && date < employee.activeFrom) throw new Error('Placeringen kan inte börja före anställningen.');
  employee.placements = [...employee.placements.filter(p => p.from !== date), { from: date, teamId: teamId || null, groupId: groupId || null }].sort((a,b) => a.from.localeCompare(b.from));
  if (group && !group.members.some(m => m.id === employee.id)) {
    const { placements, departmentId, ...member } = employee;
    group.members.push(structuredClone(member));
    for (const v of group.versions) v.positions[member.id] = 1;
  }
}
