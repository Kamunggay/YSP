import { identifiers, requirementsIn } from './inventory.mjs';

// Individual refinements of implementation-plan section 8's grouped acceptance ledger.
// These are planning assignments, not new requirements or evidence of execution.
const productAcceptance = [
  'P07 P12', 'P11 P15', 'P13 P15', 'P06', 'P20 P21 P23', 'P17 P23', 'P10', 'P14 P15', 'P14', 'P14 P19',
  'P13 P15', 'P16', 'P18 P19 P21 P23', 'P07 P12', 'P08 P09', 'P08 P09 P10', 'P17 P23', 'P22',
  'P02 P24 P26', 'P19', 'P26', 'P28', 'P24',
];
const addedAcceptance = [
  'P05 P07 P12 P24', 'P14', 'P07 P12 P24', 'P07 P12 P24', 'P04 P11 P15', 'P04 P11 P15',
  'P21', 'P17 P23', 'P02 P26', 'P23', 'P08 P14', 'P25 P24',
];
const closure = {
  RF: 'P11 P20 P23', 'SO/lines': 'P12 P14 P15 P19', Reservation: 'P07 P12 P14 P15 P20',
  Backorder: 'P09 P14 P15 P19', RepF: 'P08 P09 P14', PO: 'P09 P10 P19', 'Receipt/RM': 'P06 P10 P16',
  Booth: 'P20 P21 P22 P23', ADJ: 'P17 P18 P19 P23', 'Payment/refund': 'P13 P15 P19 P23',
};
export const acceptanceOwners = key => identifiers((key.startsWith('ADD-') ? addedAcceptance : productAcceptance)[Number(key.slice(-2)) - 1] ?? '', 'P');
export const closureOwners = key => identifiers(closure[key] ?? '', 'P');

export function nodeOwners(baseline, key) {
  // First match is in the exact-node allocation table, before the decision checklist.
  const row = baseline.planningReferences.find(ref => {
    const cells = ref.text.split('|').slice(1, -1).map(s => s.trim());
    return /^S[1-4]-\d\d/.test(cells[0] ?? '') && identifiers(cells[0], key.slice(0, 2)).includes(key);
  });
  return row ? identifiers(row.text.split('|')[2], 'P') : [];
}

export function branchOwners(baseline, key) {
  const node = key.split(':')[0];
  const decision = baseline.decisionOwnership.find(row => row.nodes.includes(node));
  return [...new Set([...nodeOwners(baseline, node), ...(decision?.packages ?? [])])];
}

export function affectedPackages(baseline, category, row) {
  if (category === 'nodes') return nodeOwners(baseline, row.key);
  if (category === 'branches') return branchOwners(baseline, row.key);
  if (category === 'acceptance') return acceptanceOwners(row.key);
  if (category === 'closure') return closureOwners(row.key);
  if (category === 'activation') {
    const packages = identifiers(row.expected, 'P');
    return packages.length ? packages : identifiers('P07–P23 P26 P28', 'P');
  }
  const requirements = category === 'requirements' ? [row.key] : row.requirements ?? [];
  const packages = baseline.packages.filter(p => requirementsIn(p.requirementStatement).some(key => requirements.includes(key))).map(p => p.key);
  // Required setup rows can affect multiple domain operations; retain their governance gate.
  return packages.length ? packages : ['P02', 'P26'];
}
