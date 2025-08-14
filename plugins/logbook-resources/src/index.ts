//
// Copyright © 2025
//
// Licensed under the Eclipse Public License, Version 2.0
//

import type { Plugin } from '@hcengineering/platform'
import { plugin } from '@hcengineering/platform'

export const logbookId = 'logbook' as Plugin

const logbook = plugin(logbookId, {
  metadata: {},
  function: {},
  viewlet: {},
  component: {}
})

export default logbook