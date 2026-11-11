// Capstone vs thesis. A group (or person) gets its type from its institute;
// no institute means capstone, which is how everything worked before.
import { DEFENSE_TYPES, DEFENSE_TYPE_LABEL } from '../constants/defense'

export const RESEARCH_TYPES = [['capstone', 'Capstone'], ['thesis', 'Thesis']]
export const RESEARCH_LABEL = Object.fromEntries(RESEARCH_TYPES)

// Works for a group ({research_type}), a user ({institute}) or a project ({group}).
export const researchTypeOf = x =>
  x?.research_type || x?.institute?.research_type || x?.group?.research_type || 'capstone'

// "Capstone" / "Thesis" for this item, or the neutral wording for staff
// who work across both.
export const researchWord = (x, { lower = false } = {}) => {
  const w = RESEARCH_LABEL[researchTypeOf(x)] || 'Capstone'
  return lower ? w.toLowerCase() : w
}

// Thesis groups have no pre-deployment defense, and their outline defense
// is called the proposal defense.
export const defenseTypesFor = type =>
  DEFENSE_TYPES.filter(([v]) => !(type === 'thesis' && v === 'pre_deployment'))
    .map(([v, l]) => [v, defenseLabel(v, type) || l])

export const defenseLabel = (value, type) =>
  type === 'thesis' && value === 'outline' ? 'Proposal Defense'
    : type === 'capstone' && value === 'outline' ? 'Outline Defense'
      : DEFENSE_TYPE_LABEL[value]

// The school's own administrator (not tied to one institute).
export const isSchoolAdmin = u => u?.role === 'admin' && !u?.institute_id
export const adminTitle = u => (u?.role !== 'admin' ? null : u.institute ? `Admin · ${u.institute.name}` : 'School Admin')
