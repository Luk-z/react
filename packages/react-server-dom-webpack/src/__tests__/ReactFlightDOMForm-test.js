/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

import {insertNodesAndExecuteScripts} from 'react-dom/src/test-utils/FizzTestUtils';

// Polyfills for test environment
global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Don't wait before processing work on the server.
// TODO: we can replace this with FlightServer.act().
global.setTimeout = cb => cb();

let container;
let clientExports;
let serverExports;
let webpackMap;
let webpackServerMap;
let React;
let ReactDOMServer;
let ReactServerDOMServer;
let ReactServerDOMClient;
let ReactDOMClient;
let useFormState;
let act;

describe('ReactFlightDOMForm', () => {
  beforeEach(() => {
    jest.resetModules();
    // Simulate the condition resolution
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.edge'),
    );
    const WebpackMock = require('./utils/WebpackMock');
    clientExports = WebpackMock.clientExports;
    serverExports = WebpackMock.serverExports;
    webpackMap = WebpackMock.webpackMap;
    webpackServerMap = WebpackMock.webpackServerMap;
    React = require('react');
    ReactServerDOMServer = require('react-server-dom-webpack/server.edge');
    ReactServerDOMClient = require('react-server-dom-webpack/client.edge');
    ReactDOMServer = require('react-dom/server.edge');
    ReactDOMClient = require('react-dom/client');
    act = require('react-dom/test-utils').act;
    useFormState = require('react-dom').experimental_useFormState;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function POST(formData) {
    const boundAction = await ReactServerDOMServer.decodeAction(
      formData,
      webpackServerMap,
    );
    const returnValue = boundAction();
    const formState = await ReactServerDOMServer.decodeFormState(
      await returnValue,
      formData,
      webpackServerMap,
    );
    return {returnValue, formState};
  }

  function submit(submitter) {
    const form = submitter.form || submitter;
    if (!submitter.form) {
      submitter = undefined;
    }
    const submitEvent = new Event('submit', {bubbles: true, cancelable: true});
    submitEvent.submitter = submitter;
    const returnValue = form.dispatchEvent(submitEvent);
    if (!returnValue) {
      return;
    }
    const action =
      (submitter && submitter.getAttribute('formaction')) || form.action;
    if (!/\s*javascript:/i.test(action)) {
      const method = (submitter && submitter.formMethod) || form.method;
      const encType = (submitter && submitter.formEnctype) || form.enctype;
      if (method === 'post' && encType === 'multipart/form-data') {
        let formData;
        if (submitter) {
          const temp = document.createElement('input');
          temp.name = submitter.name;
          temp.value = submitter.value;
          submitter.parentNode.insertBefore(temp, submitter);
          formData = new FormData(form);
          temp.parentNode.removeChild(temp);
        } else {
          formData = new FormData(form);
        }
        return POST(formData);
      }
      throw new Error('Navigate to: ' + action);
    }
  }

  async function readIntoContainer(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      result += Buffer.from(value).toString('utf8');
    }
    const temp = document.createElement('div');
    temp.innerHTML = result;
    insertNodesAndExecuteScripts(temp, container, null);
  }

  // @gate enableFormActions
  it('can submit a passed server action without hydrating it', async () => {
    let foo = null;

    const serverAction = serverExports(function action(formData) {
      foo = formData.get('foo');
      return 'hello';
    });
    function App() {
      return (
        <form action={serverAction}>
          <input type="text" name="foo" defaultValue="bar" />
        </form>
      );
    }
    const rscStream = ReactServerDOMServer.renderToReadableStream(<App />);
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.firstChild;

    expect(foo).toBe(null);

    const {returnValue} = await submit(form);

    expect(returnValue).toBe('hello');
    expect(foo).toBe('bar');
  });

  // @gate enableFormActions
  it('can submit an imported server action without hydrating it', async () => {
    let foo = null;

    const ServerModule = serverExports(function action(formData) {
      foo = formData.get('foo');
      return 'hi';
    });
    const serverAction = ReactServerDOMClient.createServerReference(
      ServerModule.$$id,
    );
    function App() {
      return (
        <form action={serverAction}>
          <input type="text" name="foo" defaultValue="bar" />
        </form>
      );
    }

    const ssrStream = await ReactDOMServer.renderToReadableStream(<App />);
    await readIntoContainer(ssrStream);

    const form = container.firstChild;

    expect(foo).toBe(null);

    const {returnValue} = await submit(form);

    expect(returnValue).toBe('hi');

    expect(foo).toBe('bar');
  });

  // @gate enableFormActions
  it('can submit a complex closure server action without hydrating it', async () => {
    let foo = null;

    const serverAction = serverExports(function action(bound, formData) {
      foo = formData.get('foo') + bound.complex;
      return 'hello';
    });
    function App() {
      return (
        <form action={serverAction.bind(null, {complex: 'object'})}>
          <input type="text" name="foo" defaultValue="bar" />
        </form>
      );
    }
    const rscStream = ReactServerDOMServer.renderToReadableStream(<App />);
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.firstChild;

    expect(foo).toBe(null);

    const {returnValue} = await submit(form);

    expect(returnValue).toBe('hello');
    expect(foo).toBe('barobject');
  });

  // @gate enableFormActions
  it('can submit a multiple complex closure server action without hydrating it', async () => {
    let foo = null;

    const serverAction = serverExports(function action(bound, formData) {
      foo = formData.get('foo') + bound.complex;
      return 'hello' + bound.complex;
    });
    function App() {
      return (
        <form action={serverAction.bind(null, {complex: 'a'})}>
          <input type="text" name="foo" defaultValue="bar" />
          <button formAction={serverAction.bind(null, {complex: 'b'})} />
          <button formAction={serverAction.bind(null, {complex: 'c'})} />
          <input
            type="submit"
            formAction={serverAction.bind(null, {complex: 'd'})}
          />
        </form>
      );
    }
    const rscStream = ReactServerDOMServer.renderToReadableStream(<App />);
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.firstChild;

    expect(foo).toBe(null);

    const {returnValue} = await submit(form.getElementsByTagName('button')[1]);

    expect(returnValue).toBe('helloc');
    expect(foo).toBe('barc');
  });

  // @gate enableFormActions
  it('can bind an imported server action on the client without hydrating it', async () => {
    let foo = null;

    const ServerModule = serverExports(function action(bound, formData) {
      foo = formData.get('foo') + bound.complex;
      return 'hello';
    });
    const serverAction = ReactServerDOMClient.createServerReference(
      ServerModule.$$id,
    );
    function Client() {
      return (
        <form action={serverAction.bind(null, {complex: 'object'})}>
          <input type="text" name="foo" defaultValue="bar" />
        </form>
      );
    }

    const ssrStream = await ReactDOMServer.renderToReadableStream(<Client />);
    await readIntoContainer(ssrStream);

    const form = container.firstChild;

    expect(foo).toBe(null);

    const {returnValue} = await submit(form);

    expect(returnValue).toBe('hello');
    expect(foo).toBe('barobject');
  });

  // @gate enableFormActions
  it('can bind a server action on the client without hydrating it', async () => {
    let foo = null;

    const serverAction = serverExports(function action(bound, formData) {
      foo = formData.get('foo') + bound.complex;
      return 'hello';
    });

    function Client({action}) {
      return (
        <form action={action.bind(null, {complex: 'object'})}>
          <input type="text" name="foo" defaultValue="bar" />
        </form>
      );
    }
    const ClientRef = await clientExports(Client);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={serverAction} />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.firstChild;

    expect(foo).toBe(null);

    const {returnValue} = await submit(form);

    expect(returnValue).toBe('hello');
    expect(foo).toBe('barobject');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  it("useFormState's dispatch binds the initial state to the provided action", async () => {
    const serverAction = serverExports(async function action(
      prevState,
      formData,
    ) {
      return {
        count: prevState.count + parseInt(formData.get('incrementAmount'), 10),
      };
    });

    const initialState = {count: 1};
    function Client({action}) {
      const [state, dispatch] = useFormState(action, initialState);
      return (
        <form action={dispatch}>
          <span>Count: {state.count}</span>
          <input type="text" name="incrementAmount" defaultValue="5" />
        </form>
      );
    }
    const ClientRef = await clientExports(Client);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={serverAction} />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.getElementsByTagName('form')[0];
    const span = container.getElementsByTagName('span')[0];
    expect(span.textContent).toBe('Count: 1');

    const {returnValue} = await submit(form);
    expect(await returnValue).toEqual({count: 6});
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  it('useFormState can reuse state during MPA form submission', async () => {
    const serverAction = serverExports(async function action(
      prevState,
      formData,
    ) {
      return prevState + 1;
    });

    function Form({action}) {
      const [count, dispatch] = useFormState(action, 1);
      return <form action={dispatch}>{count}</form>;
    }

    function Client({action}) {
      return (
        <div>
          <Form action={action} />
          <Form action={action} />
          <Form action={action} />
        </div>
      );
    }

    const ClientRef = await clientExports(Client);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={serverAction} />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    expect(container.textContent).toBe('111');

    // There are three identical forms. We're going to submit the second one.
    const form = container.getElementsByTagName('form')[1];
    const {formState} = await submit(form);

    // Simulate an MPA form submission by resetting the container and
    // rendering again.
    container.innerHTML = '';

    const postbackRscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={serverAction} />,
      webpackMap,
    );
    const postbackResponse = ReactServerDOMClient.createFromReadableStream(
      postbackRscStream,
      {
        ssrManifest: {
          moduleMap: null,
          moduleLoading: null,
        },
      },
    );
    const postbackSsrStream = await ReactDOMServer.renderToReadableStream(
      postbackResponse,
      {experimental_formState: formState},
    );
    await readIntoContainer(postbackSsrStream);

    // Only the second form's state should have been updated.
    expect(container.textContent).toBe('121');

    // Test that it hydrates correctly
    if (__DEV__) {
      // TODO: Can't use our internal act() util that works in production
      // because it works by overriding the timer APIs, which this test module
      // also does. Remove dev condition once FlightServer.act() is available.
      await act(() => {
        ReactDOMClient.hydrateRoot(container, postbackResponse, {
          experimental_formState: formState,
        });
      });
      expect(container.textContent).toBe('121');
    }
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  it(
    'useFormState preserves state if arity is the same, but different ' +
      'arguments are bound (i.e. inline closure)',
    async () => {
      const serverAction = serverExports(async function action(
        stepSize,
        prevState,
        formData,
      ) {
        return prevState + stepSize;
      });

      function Form({action}) {
        const [count, dispatch] = useFormState(action, 1);
        return <form action={dispatch}>{count}</form>;
      }

      function Client({action}) {
        return (
          <div>
            <Form action={action} />
            <Form action={action} />
            <Form action={action} />
          </div>
        );
      }

      const ClientRef = await clientExports(Client);

      const rscStream = ReactServerDOMServer.renderToReadableStream(
        // Note: `.bind` is the same as an inline closure with 'use server'
        <ClientRef action={serverAction.bind(null, 1)} />,
        webpackMap,
      );
      const response = ReactServerDOMClient.createFromReadableStream(
        rscStream,
        {
          ssrManifest: {
            moduleMap: null,
            moduleLoading: null,
          },
        },
      );
      const ssrStream = await ReactDOMServer.renderToReadableStream(response);
      await readIntoContainer(ssrStream);

      expect(container.textContent).toBe('111');

      // There are three identical forms. We're going to submit the second one.
      const form = container.getElementsByTagName('form')[1];
      const {formState} = await submit(form);

      // Simulate an MPA form submission by resetting the container and
      // rendering again.
      container.innerHTML = '';

      // On the next page, the same server action is rendered again, but with
      // a different bound stepSize argument. We should treat this as the same
      // action signature.
      const postbackRscStream = ReactServerDOMServer.renderToReadableStream(
        // Note: `.bind` is the same as an inline closure with 'use server'
        <ClientRef action={serverAction.bind(null, 5)} />,
        webpackMap,
      );
      const postbackResponse = ReactServerDOMClient.createFromReadableStream(
        postbackRscStream,
        {
          ssrManifest: {
            moduleMap: null,
            moduleLoading: null,
          },
        },
      );
      const postbackSsrStream = await ReactDOMServer.renderToReadableStream(
        postbackResponse,
        {experimental_formState: formState},
      );
      await readIntoContainer(postbackSsrStream);

      // The state should have been preserved because the action signatures are
      // the same. (Note that the amount increased by 1, because that was the
      // value of stepSize at the time the form was submitted)
      expect(container.textContent).toBe('121');

      // Now submit the form again. This time, the state should increase by 5
      // because the stepSize argument has changed.
      const form2 = container.getElementsByTagName('form')[1];
      const {formState: formState2} = await submit(form2);

      container.innerHTML = '';

      const postbackRscStream2 = ReactServerDOMServer.renderToReadableStream(
        // Note: `.bind` is the same as an inline closure with 'use server'
        <ClientRef action={serverAction.bind(null, 5)} />,
        webpackMap,
      );
      const postbackResponse2 = ReactServerDOMClient.createFromReadableStream(
        postbackRscStream2,
        {
          ssrManifest: {
            moduleMap: null,
            moduleLoading: null,
          },
        },
      );
      const postbackSsrStream2 = await ReactDOMServer.renderToReadableStream(
        postbackResponse2,
        {experimental_formState: formState2},
      );
      await readIntoContainer(postbackSsrStream2);

      expect(container.textContent).toBe('171');
    },
  );

  // @gate enableFormActions
  // @gate enableAsyncActions
  it('useFormState does not reuse state if action signatures are different', async () => {
    // This is the same as the previous test, except instead of using bind to
    // configure the server action (i.e. a closure), it swaps the action.
    const increaseBy1 = serverExports(async function action(
      prevState,
      formData,
    ) {
      return prevState + 1;
    });

    const increaseBy5 = serverExports(async function action(
      prevState,
      formData,
    ) {
      return prevState + 5;
    });

    function Form({action}) {
      const [count, dispatch] = useFormState(action, 1);
      return <form action={dispatch}>{count}</form>;
    }

    function Client({action}) {
      return (
        <div>
          <Form action={action} />
          <Form action={action} />
          <Form action={action} />
        </div>
      );
    }

    const ClientRef = await clientExports(Client);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={increaseBy1} />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    expect(container.textContent).toBe('111');

    // There are three identical forms. We're going to submit the second one.
    const form = container.getElementsByTagName('form')[1];
    const {formState} = await submit(form);

    // Simulate an MPA form submission by resetting the container and
    // rendering again.
    container.innerHTML = '';

    // On the next page, a different server action is rendered. It should not
    // reuse the state from the previous page.
    const postbackRscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={increaseBy5} />,
      webpackMap,
    );
    const postbackResponse = ReactServerDOMClient.createFromReadableStream(
      postbackRscStream,
      {
        ssrManifest: {
          moduleMap: null,
          moduleLoading: null,
        },
      },
    );
    const postbackSsrStream = await ReactDOMServer.renderToReadableStream(
      postbackResponse,
      {experimental_formState: formState},
    );
    await readIntoContainer(postbackSsrStream);

    // The state should not have been preserved because the action signatures
    // are not the same.
    expect(container.textContent).toBe('111');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  it('when permalink is provided, useFormState compares that instead of the keypath', async () => {
    const serverAction = serverExports(async function action(
      prevState,
      formData,
    ) {
      return prevState + 1;
    });

    function Form({action, permalink}) {
      const [count, dispatch] = useFormState(action, 1, permalink);
      return <form action={dispatch}>{count}</form>;
    }

    function Page1({action, permalink}) {
      return <Form action={action} permalink={permalink} />;
    }

    function Page2({action, permalink}) {
      return <Form action={action} permalink={permalink} />;
    }

    const Page1Ref = await clientExports(Page1);
    const Page2Ref = await clientExports(Page2);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <Page1Ref action={serverAction} permalink="/permalink" />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    expect(container.textContent).toBe('1');

    // Submit the form
    const form = container.getElementsByTagName('form')[0];
    const {formState} = await submit(form);

    // Simulate an MPA form submission by resetting the container and
    // rendering again.
    container.innerHTML = '';

    // On the next page, the same server action is rendered again, but in
    // a different component tree. However, because a permalink option was
    // passed, the state should be preserved.
    const postbackRscStream = ReactServerDOMServer.renderToReadableStream(
      <Page2Ref action={serverAction} permalink="/permalink" />,
      webpackMap,
    );
    const postbackResponse = ReactServerDOMClient.createFromReadableStream(
      postbackRscStream,
      {
        ssrManifest: {
          moduleMap: null,
          moduleLoading: null,
        },
      },
    );
    const postbackSsrStream = await ReactDOMServer.renderToReadableStream(
      postbackResponse,
      {experimental_formState: formState},
    );
    await readIntoContainer(postbackSsrStream);

    expect(container.textContent).toBe('2');

    // Now submit the form again. This time, the permalink will be different, so
    // the state is not preserved.
    const form2 = container.getElementsByTagName('form')[0];
    const {formState: formState2} = await submit(form2);

    container.innerHTML = '';

    const postbackRscStream2 = ReactServerDOMServer.renderToReadableStream(
      <Page1Ref action={serverAction} permalink="/some-other-permalink" />,
      webpackMap,
    );
    const postbackResponse2 = ReactServerDOMClient.createFromReadableStream(
      postbackRscStream2,
      {
        ssrManifest: {
          moduleMap: null,
          moduleLoading: null,
        },
      },
    );
    const postbackSsrStream2 = await ReactDOMServer.renderToReadableStream(
      postbackResponse2,
      {experimental_formState: formState2},
    );
    await readIntoContainer(postbackSsrStream2);

    // The state was reset because the permalink didn't match
    expect(container.textContent).toBe('1');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  it('useFormState can change the action URL with the `permalink` argument', async () => {
    const serverAction = serverExports(function action(prevState) {
      return {state: prevState.count + 1};
    });

    const initialState = {count: 1};
    function Client({action}) {
      const [state, dispatch] = useFormState(
        action,
        initialState,
        '/permalink',
      );
      return (
        <form action={dispatch}>
          <span>Count: {state.count}</span>
        </form>
      );
    }
    const ClientRef = await clientExports(Client);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={serverAction} />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.getElementsByTagName('form')[0];
    const span = container.getElementsByTagName('span')[0];
    expect(span.textContent).toBe('Count: 1');

    expect(form.action).toBe('http://localhost/permalink');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  it('useFormState `permalink` is coerced to string', async () => {
    const serverAction = serverExports(function action(prevState) {
      return {state: prevState.count + 1};
    });

    class Permalink {
      toString() {
        return '/permalink';
      }
    }

    const permalink = new Permalink();

    const initialState = {count: 1};
    function Client({action}) {
      const [state, dispatch] = useFormState(action, initialState, permalink);
      return (
        <form action={dispatch}>
          <span>Count: {state.count}</span>
        </form>
      );
    }
    const ClientRef = await clientExports(Client);

    const rscStream = ReactServerDOMServer.renderToReadableStream(
      <ClientRef action={serverAction} />,
      webpackMap,
    );
    const response = ReactServerDOMClient.createFromReadableStream(rscStream, {
      ssrManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
    const ssrStream = await ReactDOMServer.renderToReadableStream(response);
    await readIntoContainer(ssrStream);

    const form = container.getElementsByTagName('form')[0];
    const span = container.getElementsByTagName('span')[0];
    expect(span.textContent).toBe('Count: 1');

    expect(form.action).toBe('http://localhost/permalink');
  });
});
