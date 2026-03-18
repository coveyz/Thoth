import { nextTick, onBeforeUnmount, ref, watch } from "vue"

/** 自动滚动 */
export const useAutoScroll = (deps: () => unknown) => {
  const bottomRef = ref<HTMLElement | null>(null);

  const stop = watch(deps, async () => {
    await nextTick();

    bottomRef.value?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, { deep: false });

  onBeforeUnmount(() => stop());

  return {
    bottomRef,
  }
}
