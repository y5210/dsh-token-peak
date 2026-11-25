/**
 * dsh-token-peak — host half.
 *
 * All behaviour lives in the browser half (./client). The empty host plugin
 * keeps the package addressable as a Loader row so the web app can mount the
 * client bundle declared in package.json's `dsh.client`.
 */
function apply() {}

export { apply }

export const name = 'dsh-token-peak'
