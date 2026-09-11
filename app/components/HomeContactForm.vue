<script setup lang="ts">
const props = withDefaults(defineProps<{ formId?: string }>(), {
  formId: 'contact',
})

const stages = [
  'есть только идея',
  'есть материалы',
  'есть дизайн',
  'нужен редизайн',
] as const

const deadlines = [
  'как можно скорее',
  '1–2 месяца',
  '3+ месяца',
  'гибкий',
] as const

const projectType = useState('home-contact-project-type', () => '')
const projectTypeError = useState('home-contact-project-type-error', () => false)
const description = useState('home-contact-description', () => '')
const contact = useState('home-contact-channel', () => '')
const consent = useState('home-contact-consent', () => false)
const stage = useState('home-contact-stage', () => '')
const deadline = useState('home-contact-deadline', () => '')
const budget = useState('home-contact-budget', () => '')
const materials = useState('home-contact-materials', () => '')
const policyOpen = ref(false)

function encodeMailBody() {
  const lines = [
    `Что нужно сделать: ${projectType.value}`,
    '',
    'О проекте:',
    description.value.trim(),
    '',
    `Как связаться: ${contact.value.trim()}`,
  ]

  if (stage.value) lines.push('', `Стадия: ${stage.value}`)
  if (deadline.value) lines.push(`Срок: ${deadline.value}`)
  if (budget.value.trim()) lines.push(`Бюджет: ${budget.value.trim()}`)
  if (materials.value.trim()) lines.push(`Материалы: ${materials.value.trim()}`)

  return lines.join('\n')
}

function submitForm() {
  if (!import.meta.client) return
  if (!projectType.value.trim()) {
    projectTypeError.value = true
    const taskInput = document.querySelector<HTMLInputElement>('#home-contact-task')
    taskInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => taskInput?.focus(), 280)
    return
  }
  const subject = encodeURIComponent(`Новый проект — ${projectType.value}`)
  const body = encodeURIComponent(encodeMailBody())
  window.location.href = `mailto:hello@kadonext.com?subject=${subject}&body=${body}`
}
</script>

<template>
  <div class="contact-form-shell">
    <form
      :id="props.formId"
      class="contact-form"
      action="mailto:hello@kadonext.com"
      method="post"
      enctype="text/plain"
      @submit.prevent="submitForm"
    >
      <div class="contact-form__row">
        <span class="contact-form__index" aria-hidden="true">002</span>
        <label class="contact-form__field">
          <span class="contact-form__label">коротко о проекте</span>
          <textarea
            v-model="description"
            name="description"
            rows="2"
            required
            :aria-describedby="`${props.formId}-description-hint`"
          />
          <span :id="`${props.formId}-description-hint`" class="contact-form__hint">
            Что вы создаёте и какую задачу должен решить сайт?<br>
            Достаточно нескольких предложений.
          </span>
        </label>
      </div>

      <div class="contact-form__row">
        <span class="contact-form__index" aria-hidden="true">003</span>
        <label class="contact-form__field">
          <span class="contact-form__label">как с вами связаться?</span>
          <input
            v-model="contact"
            name="contact"
            type="text"
            autocomplete="email"
            required
            :aria-describedby="`${props.formId}-channel-hint`"
          >
          <span :id="`${props.formId}-channel-hint`" class="contact-form__hint">имя, telegram или email</span>
        </label>
      </div>

      <div class="contact-form__row contact-form__row--consent">
        <span class="contact-form__index" aria-hidden="true">004</span>
        <div class="contact-form__field">
          <label class="contact-form__consent">
            <input v-model="consent" name="consent" type="checkbox" required>
            <span class="contact-form__checkbox" aria-hidden="true" />
            <span>
              Согласен(-на) на обработку персональных данных для рассмотрения обращения и ответа на него.
              <button type="button" @click="policyOpen = !policyOpen">
                Условия обработки персональных данных
              </button>
            </span>
          </label>
          <p v-if="policyOpen" class="contact-form__policy">
            Контакт и сведения о проекте используются только для ответа на обращение и не передаются третьим лицам без законного основания. Удалить данные можно по запросу на
            <a href="mailto:hello@kadonext.com">hello@kadonext.com</a>.
          </p>
        </div>
      </div>

      <details class="contact-form__details">
        <summary>
          <span aria-hidden="true">+</span>
          <strong>Добавить детали,</strong> чтобы разговор получился предметнее
        </summary>
        <div class="contact-form__details-grid">
          <label>
            <span>стадия проекта</span>
            <select v-model="stage" name="stage">
              <option value="">не выбрано</option>
              <option v-for="item in stages" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>желаемый срок</span>
            <select v-model="deadline" name="deadline">
              <option value="">не выбрано</option>
              <option v-for="item in deadlines" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>ориентир по бюджету</span>
            <input v-model="budget" name="budget" type="text" inputmode="text">
          </label>
          <label>
            <span>ссылка на материалы</span>
            <input v-model="materials" name="materials" type="url" inputmode="url">
          </label>
        </div>
      </details>

      <div class="contact-form__actions">
        <button class="contact-form__submit" type="submit">Продолжить разговор</button>
        <a href="mailto:hello@kadonext.com">или написать сразу на hello@kadonext.com</a>
      </div>
    </form>
  </div>
</template>

<style scoped>
.contact-form-shell {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: inherit;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  padding: clamp(4rem, 6vw, 7rem) var(--layout-margin-content)
    clamp(3.5rem, 5vw, 6rem);
  color: var(--palette-ink);
}

.contact-form {
  grid-column: 4 / span 7;
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: clamp(2.1rem, 3.1vw, 3.8rem);
}

.contact-form__row {
  display: grid;
  grid-template-columns: minmax(2.2rem, 0.8fr) minmax(0, 7fr);
  column-gap: var(--layout-gutter);
}

.contact-form__index {
  padding-top: 0.15rem;
  color: var(--palette-moss);
  font-size: clamp(0.8rem, 0.95vw, 1rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
}

.contact-form__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.contact-form__label {
  display: block;
  margin: 0;
  color: color-mix(in srgb, var(--palette-ink) 24%, transparent);
  font-size: clamp(1rem, 1.25vw, 1.35rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.contact-form textarea,
.contact-form__field > input {
  width: 100%;
  min-height: 2.25rem;
  border: 0;
  border-bottom: 1.5px solid var(--palette-ink);
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--palette-ink);
  font: inherit;
  font-size: 1rem;
  resize: vertical;
}

.contact-form textarea:focus,
.contact-form__field > input:focus {
  border-bottom-color: var(--palette-moss);
  box-shadow: 0 1px 0 var(--palette-moss);
}

.contact-form__hint {
  display: block;
  margin-top: 0.8rem;
  color: var(--palette-moss);
  font-size: clamp(0.88rem, 1vw, 1.05rem);
  letter-spacing: -0.02em;
  line-height: 1.28;
}

.contact-form__consent {
  display: grid;
  grid-template-columns: 1.35rem minmax(0, 1fr);
  column-gap: 0.9rem;
  align-items: start;
  color: var(--palette-moss);
  cursor: pointer;
  font-size: clamp(0.86rem, 1vw, 1rem);
  letter-spacing: -0.015em;
  line-height: 1.25;
}

.contact-form__consent input {
  position: absolute;
  opacity: 0;
}

.contact-form__checkbox {
  width: 1.35rem;
  height: 1.35rem;
  border: 1.5px solid var(--palette-ink);
  margin-top: 0.05rem;
}

.contact-form__consent input:checked + .contact-form__checkbox {
  background: var(--palette-moss);
  box-shadow: inset 0 0 0 0.28rem var(--palette-stone);
}

.contact-form__consent input:focus-visible + .contact-form__checkbox {
  outline: 2px solid var(--palette-moss);
  outline-offset: 3px;
}

.contact-form__consent button,
.contact-form__policy a,
.contact-form__actions a {
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.16em;
}

.contact-form__policy {
  max-width: 62ch;
  margin: 0.9rem 0 0 2.25rem;
  color: var(--palette-moss);
  font-size: 0.86rem;
  line-height: 1.35;
}

.contact-form__details {
  margin-left: calc((100% + var(--layout-gutter)) / 8 * -1);
}

.contact-form__details summary {
  display: grid;
  grid-template-columns: minmax(2.2rem, 0.8fr) minmax(0, 7fr);
  column-gap: var(--layout-gutter);
  align-items: baseline;
  cursor: pointer;
  font-size: clamp(1rem, 1.2vw, 1.25rem);
  list-style: none;
}

.contact-form__details summary::-webkit-details-marker { display: none; }

.contact-form__details summary > span {
  color: var(--palette-moss);
  font-size: 1.5em;
  font-weight: 300;
  transform-origin: center;
  transition: transform 0.35s var(--motion-ease, ease);
}

.contact-form__details[open] summary > span { transform: rotate(45deg); }

.contact-form__details summary strong {
  color: var(--palette-moss);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

.contact-form__details-grid {
  display: grid;
  margin: 1.5rem 0 0 calc((100% + var(--layout-gutter)) / 8);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem var(--layout-gutter);
}

.contact-form__details-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  color: var(--palette-moss);
  font-size: 0.86rem;
}

.contact-form__details-grid input,
.contact-form__details-grid select {
  min-height: 2.5rem;
  border: 0;
  border-bottom: 1px solid var(--palette-ink);
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--palette-ink);
  font: inherit;
}

.contact-form__actions {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.contact-form__submit {
  min-height: 3rem;
  border: 1.5px solid var(--palette-ink);
  border-radius: 999px;
  padding: 0.7rem 1.25rem;
  background: var(--palette-ink);
  color: var(--palette-sand);
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}

.contact-form__submit:hover,
.contact-form__submit:focus-visible {
  background: var(--palette-moss);
  border-color: var(--palette-moss);
}

.contact-form__actions a {
  color: var(--palette-moss);
  font-size: 0.9rem;
}

@media (max-width: 767.98px) {
  .contact-form-shell {
    display: block;
    padding: clamp(3rem, 14vw, 4.5rem) var(--layout-margin-content) 3rem;
  }

  .contact-form {
    gap: 2.6rem;
  }

  .contact-form__row {
    grid-template-columns: 2.5rem minmax(0, 1fr);
    column-gap: 0.75rem;
  }

  .contact-form__label { font-size: 1rem; }

  .contact-form__row--consent .contact-form__field {
    min-width: 0;
  }

  .contact-form__consent {
    grid-template-columns: 1.25rem minmax(0, 1fr);
    column-gap: 0.75rem;
    font-size: 0.82rem;
  }

  .contact-form__checkbox {
    width: 1.25rem;
    height: 1.25rem;
  }

  .contact-form__details {
    margin-left: 0;
  }

  .contact-form__details summary {
    grid-template-columns: 2.5rem minmax(0, 1fr);
    column-gap: 0.75rem;
    font-size: 1rem;
  }

  .contact-form__details-grid {
    margin-left: 3.25rem;
    grid-template-columns: 1fr;
  }

  .contact-form__actions {
    margin-left: 3.25rem;
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .contact-form__details summary > span { transition: none; }
}
</style>
