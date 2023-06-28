/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';
import {useRef, useState} from 'react';

export default function App(): React.Node {
  return <List />;
}

function List() {
  const [items, setItems] = useState(['one', 'two', 'three']);
  const inputRef = useRef(null);

  const addItem = () => {
    const input = ((inputRef.current: any): HTMLInputElement);
    const text = input.value;
    input.value = '';

    if (text) {
      setItems([...items, text]);
    }
  };

  const [val, setVal] = useState('false');
  const async = true;
  const onChange = e => {
    if (async) {
      setTimeout(() => {
        setVal(e.target.value);
      }, 1000);
      return;
    }

    setVal(e.target.value);
  };

  return (
    <>
      <input ref={inputRef} data-testname="AddItemInput" />
      <button data-testname="AddItemButton" onClick={addItem}>
        Add Item
      </button>
      <ul data-testname="List">
        {items.map((label, index) => (
          <ListItem key={index} label={label} />
        ))}
      </ul>
      <div>
        Sample radio box example to test radio input onChange with async
        setValue:
        <br />
        TRUE
        <input
          name="rg"
          value="true"
          onChange={onChange}
          checked={val === 'true'}
          type="radio"
        />
        FALSE
        <input
          name="rg"
          value="false"
          onChange={onChange}
          checked={val === 'false'}
          type="radio"
        />
        <div>VALUE: {val}</div>
      </div>
    </>
  );
}

// $FlowFixMe[missing-local-annot]
function ListItem({label}) {
  return <li data-testname="ListItem">{label}</li>;
}
