declare module '@welldone-software/why-did-you-render' {
  interface WhyDidYouRenderOptions {
    trackAllPureComponents?: boolean;
    trackHooks?: boolean;
    logOwnerReasons?: boolean;
    collapseGroups?: boolean;
    hotReloadBufferMs?: number;
  }

  interface _WhyDidYouRenderComponentOptions {
    whyDidYouRender?: boolean | WhyDidYouRenderOptions;
  }

  function whyDidYouRender(
    React: unknown,
    options?: WhyDidYouRenderOptions
  ): void;

  export = whyDidYouRender;
}

declare global {
  namespace React {
    interface Component<_P = object, _S = object, _SS = unknown> {
      whyDidYouRender?: boolean | unknown;
    }
  }
}
