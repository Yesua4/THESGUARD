// The school's defense evaluation sheet (Pre-Deployment Defense Evaluation),
// mirrored by EvaluationController on the backend.

export const INDIVIDUAL_CRITERIA = [
  {
    key: 'disposition', label: 'Disposition', max: 30,
    points: ['Generally neat appearance', 'Projects an aura of confidence', 'Preparedness and teamwork'],
  },
  {
    key: 'delivery', label: 'Delivery and Presentation', max: 70,
    // On the sheet these are listed as guidance for the one Delivery score.
    groups: [
      ['Organization of Content', ['Sense of segmentation', 'Presentation not interrupted to reload a file', 'Smoothness of presentation flow', 'No inconsistencies within content']],
      ['Manner of Presentation', ['Presenter does not tend to talk to the screen', 'Does not have some hesitancy in speaking', 'Less consulting of notes and has good eye contact with panelists', 'Volume of voice is adequate and can be heard by everyone', 'Does not delve too long on a specific subject matter', 'Use of clear visuals and appropriate materials for presentation']],
      ['Ability to Defend Ideas and Technical Output', ['Ability to respond to questions and criticisms', 'Has good responses to critiques & comments', "Doesn't have any tendency to go into other issues when answering questions", 'Attitude towards suggestions given (i.e., receptive, not hostile or indifferent)']],
    ],
  },
]

export const GROUP_CRITERIA = [
  { key: 'documentation', label: 'Documentation', max: 50, points: ['Mechanics - Spelling/Punctuation/Grammar/Structure', 'Completeness', 'Content (should be correct and consistent)'] },
  { key: 'software', label: 'Software', max: 50, points: ['Successful implementation of the set objectives', 'Technical output as a reliable proof of concept of the study', 'Degree of impact on the panelists', 'Exhibits ease of use and user friendliness'] },
]

export const VERDICTS = [
  ['passed_no_revisions', 'Passed (No revisions needed)'],
  ['passed_with_revisions', 'Passed (With revisions needed)'],
  ['conditional', 'Conditional Passed'],
  ['failed', 'Failed'],
]
export const VERDICT_LABEL = Object.fromEntries(VERDICTS)

export const verdictStyle = v =>
  v?.startsWith('passed') ? { background: '#d1fae5', color: '#065f46' }
    : v === 'failed' ? { background: '#fee2e2', color: '#9f1239' }
      : v === 'conditional' ? { background: '#fef3c7', color: '#92400e' }
        : { background: '#f1f5f9', color: '#64748b' }
