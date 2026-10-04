// The main Dancheong host can inject same-origin endpoints before vn.js loads.
// Engine, cloud client, and presentation code do not own authentication.
const defaults = { accountEndpoint: '/api/account', cloudBase: '/api/cloud/slots',
  signIn: '/signin-with-chatgpt?return_to=%2Fcortex', signOut: '/signout-with-chatgpt?return_to=%2Fcortex' };
export function hostServices(configuration = globalThis.DancheongVNHost) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = configuration?.[key];
    if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) result[key] = value;
  }
  return result;
}
