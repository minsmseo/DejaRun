import Resolver from '@forge/resolver';

// Resolver entry point. No functions are defined yet; the panel does not call the backend.
const resolver = new Resolver();

export const handler = resolver.getDefinitions();
