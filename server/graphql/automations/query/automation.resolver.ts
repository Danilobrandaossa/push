import { defineQuery } from 'nitro-graphql/utils/define'

export const automationQuery = defineQuery({
  automation: {
    resolve: async (_parent, { id }, { context }) => {
      const { dataloaders } = context
      return await dataloaders.automationLoader.load(id)
    },
  },
})

