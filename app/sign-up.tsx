import { Redirect } from 'expo-router'

/** Los enlaces de registro anteriores llevan a la misma entrada con Google. */
export default function SignUp() {
  return <Redirect href="/sign-in" />
}
