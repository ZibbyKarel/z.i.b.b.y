import type { FormHTMLAttributes, ReactNode } from "react"
import {
  type FieldValues,
  FormProvider,
  type SubmitHandler,
  type UseFormProps,
  useForm,
} from "react-hook-form"

export type FormControlsOptions<TFieldValues extends FieldValues> = UseFormProps<TFieldValues> & {
  onSubmit: SubmitHandler<TFieldValues>
}

export type FormControls<TFieldValues extends FieldValues = FieldValues> = ReturnType<
  typeof useFormControls<TFieldValues>
>

export function useFormControls<TFieldValues extends FieldValues>({
  onSubmit,
  ...formProps
}: FormControlsOptions<TFieldValues>) {
  const form = useForm<TFieldValues>(formProps)
  const submit = form.handleSubmit(onSubmit)

  function renderForm(children: ReactNode) {
    return (
      <FormProvider {...form}>
        <form onSubmit={submit}>{children}</form>
      </FormProvider>
    )
  }

  return { renderForm, submit, form }
}

export interface FormProps<TFieldValues extends FieldValues>
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  formOptions?: UseFormProps<TFieldValues>
  onSubmit: SubmitHandler<TFieldValues>
  children: ReactNode
}

export function Form<TFieldValues extends FieldValues>({
  formOptions,
  onSubmit,
  children,
  ...rest
}: FormProps<TFieldValues>) {
  const form = useForm<TFieldValues>(formOptions)
  const submit = form.handleSubmit(onSubmit)
  return (
    <FormProvider {...form}>
      <form {...rest} onSubmit={submit}>
        {children}
      </form>
    </FormProvider>
  )
}
