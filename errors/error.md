index.ts:21:1 - error TS1378: Top-level 'await' expressions are only allowed when the 'module' option is set to 'es2022', 'esnext', 'system', 'node16', 'node18', 'node20', 'nodenext', or 'preserve', and the 'target' option is set to 'es2017' or higher.

21 await agent.prompt("Hello!");
   ~~~~~

node_modules/@anthropic-ai/sdk/client.d.ts:109:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

109     #private;
        ~~~~~~~~

node_modules/@anthropic-ai/sdk/core/api-promise.d.ts:9:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

9     #private;
      ~~~~~~~~

node_modules/@anthropic-ai/sdk/core/pagination.d.ts:7:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

7     #private;
      ~~~~~~~~

node_modules/@anthropic-ai/sdk/core/streaming.d.ts:9:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

9     #private;
      ~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/decoders/line.d.ts:9:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

9     #private;
      ~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:181 - error TS2307: Cannot find module '../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:340 - error TS2307: Cannot find module '../../../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                                                                                                                                                                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:424 - error TS2307: Cannot find module '../../../../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                                                                                                                                                                                                                                                                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:511 - error TS2307: Cannot find module '../../../../../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:601 - error TS2307: Cannot find module '../../../../../../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:694 - error TS2307: Cannot find module '../../../../../../../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/internal/types.d.ts:48:790 - error TS2307: Cannot find module '../../../../../../../../../../node_modules/undici-types/index.d.ts' or its corresponding type declarations.

48 /** @ts-ignore For users with \@types/node */ type UndiciTypesRequestInit = NotAny<import('undici-types').RequestInit> | NotAny<import('undici-types').RequestInit> | NotAny<import('../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit> | NotAny<import('../../../../../../../../../../node_modules/undici-types/index.d.ts').RequestInit>;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.d.ts:24:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

24     #private;
       ~~~~~~~~

node_modules/@anthropic-ai/sdk/lib/MessageStream.d.ts:23:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

23     #private;
       ~~~~~~~~

node_modules/@anthropic-ai/sdk/lib/tools/BetaToolRunner.d.ts:14:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

14     #private;
       ~~~~~~~~

node_modules/@google/genai/dist/genai.d.ts:3:29 - error TS2307: Cannot find module '@modelcontextprotocol/sdk/client/index.js' or its corresponding type declarations.

3 import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

node_modules/gaxios/build/cjs/src/gaxios.d.ts:16:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

16     #private;
       ~~~~~~~~

node_modules/gaxios/build/cjs/src/gaxios.d.ts:52:5 - error TS2416: Property 'fetch' in type 'Gaxios' is not assignable to the same property in base type 'FetchCompliance'.
  Property 'preconnect' is missing in type '<T = unknown>(...args: [input: string | Request | URL, init?: RequestInit] | [opts?: GaxiosOptions]) => GaxiosPromise<T>' but required in type 'typeof fetch'.

52     fetch<T = unknown>(...args: Parameters<typeof fetch> | Parameters<Gaxios['request']>): GaxiosPromise<T>;
       ~~~~~

  node_modules/bun-types/globals.d.ts:2062:19
    2062   export function preconnect(
                           ~~~~~~~~~~
    'preconnect' is declared here.

node_modules/google-auth-library/build/src/auth/awsclient.d.ts:83:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

83     #private;
       ~~~~~~~~

node_modules/google-auth-library/build/src/auth/baseexternalclient.d.ts:173:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

173     #private;
        ~~~~~~~~

node_modules/google-auth-library/build/src/auth/googleauth.d.ts:160:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

160     #private;
        ~~~~~~~~

node_modules/google-auth-library/build/src/auth/oauth2common.d.ts:50:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

50     #private;
       ~~~~~~~~

node_modules/google-auth-library/build/src/auth/stscredentials.d.ts:99:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

99     #private;
       ~~~~~~~~

node_modules/google-auth-library/build/src/util.d.ts:125:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

125     #private;
        ~~~~~~~~

node_modules/openai/client.d.ts:134:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

134     #private;
        ~~~~~~~~

node_modules/openai/core/api-promise.d.ts:9:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

9     #private;
      ~~~~~~~~

node_modules/openai/core/pagination.d.ts:7:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

7     #private;
      ~~~~~~~~

node_modules/openai/core/streaming.d.ts:9:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

9     #private;
      ~~~~~~~~

node_modules/openai/lib/AbstractChatCompletionRunner.d.ts:14:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

14     #private;
       ~~~~~~~~

node_modules/openai/lib/AssistantStream.d.ts:36:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

36     #private;
       ~~~~~~~~

node_modules/openai/lib/ChatCompletionStream.d.ts:68:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

68     #private;
       ~~~~~~~~

node_modules/openai/lib/EventStream.d.ts:3:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

3     #private;
      ~~~~~~~~

node_modules/openai/lib/responses/ResponseStream.d.ts:47:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

47     #private;
       ~~~~~~~~

node_modules/openai/resources/webhooks/webhooks.d.ts:4:5 - error TS18028: Private identifiers are only available when targeting ECMAScript 2015 and higher.

4     #private;
      ~~~~~~~~


Found 35 errors in 28 files.

Errors  Files
     1  index.ts:21
     1  node_modules/@anthropic-ai/sdk/client.d.ts:109
     1  node_modules/@anthropic-ai/sdk/core/api-promise.d.ts:9
     1  node_modules/@anthropic-ai/sdk/core/pagination.d.ts:7
     1  node_modules/@anthropic-ai/sdk/core/streaming.d.ts:9
     1  node_modules/@anthropic-ai/sdk/internal/decoders/line.d.ts:9
     7  node_modules/@anthropic-ai/sdk/internal/types.d.ts:48
     1  node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.d.ts:24
     1  node_modules/@anthropic-ai/sdk/lib/MessageStream.d.ts:23
     1  node_modules/@anthropic-ai/sdk/lib/tools/BetaToolRunner.d.ts:14
     1  node_modules/@google/genai/dist/genai.d.ts:3
     2  node_modules/gaxios/build/cjs/src/gaxios.d.ts:16
     1  node_modules/google-auth-library/build/src/auth/awsclient.d.ts:83
     1  node_modules/google-auth-library/build/src/auth/baseexternalclient.d.ts:173
     1  node_modules/google-auth-library/build/src/auth/googleauth.d.ts:160
     1  node_modules/google-auth-library/build/src/auth/oauth2common.d.ts:50
     1  node_modules/google-auth-library/build/src/auth/stscredentials.d.ts:99
     1  node_modules/google-auth-library/build/src/util.d.ts:125
     1  node_modules/openai/client.d.ts:134
     1  node_modules/openai/core/api-promise.d.ts:9
     1  node_modules/openai/core/pagination.d.ts:7
     1  node_modules/openai/core/streaming.d.ts:9
     1  node_modules/openai/lib/AbstractChatCompletionRunner.d.ts:14
     1  node_modules/openai/lib/AssistantStream.d.ts:36
     1  node_modules/openai/lib/ChatCompletionStream.d.ts:68
     1  node_modules/openai/lib/EventStream.d.ts:3
     1  node_modules/openai/lib/responses/ResponseStream.d.ts:47
     1  node_modules/openai/resources/webhooks/webhooks.d.ts:4
