interface AppQuery {
  query: string;
}

export const appQueries: Record<string, AppQuery> = {
  getCompletions: {
    query: `SELECT word, context, belongs FROM system.completions`,
  },
};
