// Intentional opt-in guard for a legacy operational script. Credentials and
// endpoints must be supplied at runtime, never embedded in this repository.
if (process.env.ALLOW_MUTATION !== 'true') {
  throw new Error('Refusing to run a mutating script. Set ALLOW_MUTATION=true after verifying the target.');
}

const required = ['EMR_API_URL', 'EMR_API_TOKEN'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

console.log('Legacy operational script is guarded. Add a reviewed, scoped operation before use.');
