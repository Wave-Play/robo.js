# Using act to locally test


We are using act to locally test CI, it is easier and faster that way though
some setup is required.

At the root of the folder you need two files.

```.env``` and ```act.vault```

content of ```.env``` for example:

```GITHUB_REPOSITORY="Nazeofel/robo"```


content of ```act.vault``` for example:

```
GH_TOKEN=Your Github token
```

.env is used for variables as it emulates github's.
.vault is used for secrets.


if you wish to test another file or add a test case

please refer to the act_local.ts file and follow the protocol.
