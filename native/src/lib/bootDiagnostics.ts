// Only fixed event codes are accepted: never pass SDK errors, keys or user data.
export function bootLog(event: `HC_${string}`) {
  console.info(event);
}
