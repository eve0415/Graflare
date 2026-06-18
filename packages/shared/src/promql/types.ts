export type LabelMatchOperator = '=' | '!=' | '=~' | '!~';

export interface PromQLLabelMatcher {
  id: string;
  label: string;
  operator: LabelMatchOperator;
  value: string;
}

export type FunctionParam =
  | { kind: 'range'; value: string }
  | { kind: 'scalar'; value: string }
  | { kind: 'grouping'; mode: 'by' | 'without'; labels: string[] };

export interface FunctionApplication {
  id: string;
  name: string;
  params: FunctionParam[];
}

export interface PromQLBuilderState {
  metric: string;
  labels: PromQLLabelMatcher[];
  functions: FunctionApplication[];
}
