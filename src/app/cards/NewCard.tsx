import React from "react";
import { Button, Flex, Link, Select, Text } from "@hubspot/ui-extensions";
import { hubspot } from "@hubspot/ui-extensions";

hubspot.extend<'crm.record.tab'>(({ context }) => <Extension context={context} />);

const Extension = ({ context }) => {

  const appCardDocsLink = 'https://www.linkedin.com/company/smarteamcr/posts/?feedView=all'
  console.log({context});

  const options = [
    { label: "Documento 1", value: 42 },
    { label: "Documento 2", value: 43 },
    { label: "Documento 3", value: 44 }
  ];

  return (
    <>
      <Flex
      direction="column"
      align="center"
      justify="center"
      gap="medium"
    >
      <Text format={{ fontWeight: "bold" }}>
        Por favor seleccione el documento que desea enviar a firmar con Docusing
      </Text>

      <Select options={options} placeholder="Seleccione un documento" />
      
      <Button>
        <Link href={appCardDocsLink}>Enviar documento</Link>
      </Button>
    </Flex>
    </>
  );
};
