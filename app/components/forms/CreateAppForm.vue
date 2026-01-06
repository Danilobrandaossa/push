<script setup lang="ts">
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'abckit/shadcn/card'

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from 'abckit/shadcn/form'
import { Input } from 'abckit/shadcn/input'
import { Textarea } from 'abckit/shadcn/textarea'
import { useForm } from 'vee-validate'
import { z } from 'zod'

// Props
interface Props {
  loading?: boolean
}

const _props = withDefaults(defineProps<Props>(), {
  loading: false,
})

// Events
const emit = defineEmits<{
  submit: [data: { name: string, slug: string, description?: string }]
  cancel: []
}>()

// Form validation schema
const formSchema = z.object({
  name: z.string().min(1, 'O nome do app é obrigatório'),
  slug: z.string()
    .min(1, 'O slug é obrigatório')
    .regex(/^[a-z0-9-]+$/, 'O slug pode conter apenas letras minúsculas, números e hífens')
    .regex(/^[a-z0-9]/, 'O slug deve começar com uma letra ou número')
    .regex(/[a-z0-9]$/, 'O slug deve terminar com uma letra ou número'),
  description: z.string().optional(),
})

// Form setup
const { handleSubmit, isSubmitting, values, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: '',
    slug: '',
    description: '',
  },
})

// Form submission
const onSubmit = handleSubmit(async (formValues) => {
  const formData = {
    name: formValues.name.trim(),
    slug: formValues.slug.trim(),
    description: formValues.description?.trim() || undefined,
  }

  emit('submit', formData)
})

// Auto-generate slug from name
watch(() => values.name, (newName) => {
  if (newName && !values.slug) {
    const slug = newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    setFieldValue('slug', slug)
  }
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Informações do App</CardTitle>
      <CardDescription>Forneça informações básicas sobre o seu aplicativo</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-6" @submit="onSubmit">
        <!-- App Name -->
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel class="required">Nome do App</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                placeholder="Meu App Incrível"
                :disabled="isSubmitting || _props.loading"
              />
            </FormControl>
            <FormDescription>
              O nome de exibição do seu aplicativo
            </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- App Slug -->
        <FormField v-slot="{ componentField }" name="slug">
          <FormItem>
            <FormLabel class="required">Slug</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                placeholder="meu-app-incrivel"
                :disabled="isSubmitting || _props.loading"
              />
            </FormControl>
            <FormDescription>
              Usado nas URLs da API e como identificador. Apenas letras minúsculas, números e hífens são permitidos.
            </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- Description -->
        <FormField v-slot="{ componentField }" name="description">
          <FormItem>
            <FormLabel>Descrição</FormLabel>
            <FormControl>
              <Textarea
                v-bind="componentField"
                placeholder="Uma breve descrição do seu app..."
                rows="3"
                :disabled="isSubmitting || _props.loading"
              />
            </FormControl>
            <FormDescription>
              Descrição opcional para ajudar você a identificar este app
            </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- Submit Buttons -->
        <div class="flex space-x-3 pt-4">
          <Button
            type="submit"
            :disabled="isSubmitting || _props.loading"
            class="flex-1"
          >
            <Icon v-if="isSubmitting || _props.loading" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
            <Icon name="lucide:plus" class="size-4 mr-2" />
            Criar App
          </Button>
          <Button type="button" variant="outline" @click="$emit('cancel')">
            Cancelar
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>

<style scoped>
.required::after {
  content: "*";
  color: rgb(239 68 68);
  margin-left: 0.25rem;
}
</style>
