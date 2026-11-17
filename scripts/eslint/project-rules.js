import noAbsoluteSrcImport from './rule/no-absolute-src-import.js'
import noBrowserNamedCallback from './rule/no-browser-named-callback.js'
import noDomQuery from './rule/no-dom-query.js'

export default {
  rules: {
    'no-browser-named-callback': noBrowserNamedCallback,
    // ...
    'no-dom-query': noDomQuery,
    'no-absolute-src-import': noAbsoluteSrcImport,
  },
}
